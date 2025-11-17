const { Markup } = require('telegraf');
const database = require('./database');
const notification = require('./notification');
const { CONFIG, botSettings } = require('./config');

class PaymentHandler {
  async handlePaymentScreenshot(ctx) {
    const userId = ctx.from.id;
    const user = await database.getUser(userId);
    
    if (!user) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Register First', 'start_registration')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);
      await ctx.reply('❌ Please complete registration first using /start', keyboard);
      return;
    }

    if (!ctx.message.photo) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📸 Send Screenshot', 'send_payment')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);
      await ctx.reply('❌ Please send a screenshot as a photo.', keyboard);
      return;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    try {
      const paymentId = `PAY_${userId}_${Date.now()}`;
      const paymentData = {
        paymentId: paymentId,
        userId: userId,
        screenshotFileId: fileId,
        amount: CONFIG.PAYMENT.DEFAULT_AMOUNT,
        status: CONFIG.PAYMENT.STATUS.PENDING,
        submittedAt: new Date().toISOString(),
        method: 'manual'
      };

      // Save payment to database
      await database.createPayment(paymentData);

      // Notify admin
      await notification.notifyPaymentSubmission(userId, paymentId, fileId);

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Main Menu', 'main_menu')],
        [Markup.button.callback('💰 Check Status', 'check_balance')]
      ]);

      await ctx.replyWithMarkdown(
        `✅ *Payment Screenshot Received!*\n\n` +
        `Admins have been notified and will verify your payment shortly.\n` +
        `Payment ID: \`${paymentId}\`\n\n` +
        `You will receive a notification once verified.`,
        keyboard
      );

    } catch (error) {
      console.error('Error processing payment screenshot:', error);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Try Again', 'send_payment')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);

      await ctx.reply('❌ Error processing payment screenshot. Please try again.', keyboard);
    }
  }

  async approvePayment(ctx, paymentId) {
    const payment = await database.getPayment(paymentId);
    if (!payment) {
      await ctx.answerCbQuery('❌ Payment not found.');
      return;
    }

    try {
      // Update payment status
      await database.updatePayment(paymentId, {
        status: CONFIG.PAYMENT.STATUS.APPROVED,
        verifiedBy: ctx.from.username,
        verifiedAt: new Date().toISOString()
      });

      // Update user status to active
      const user = await database.getUser(payment.userId);
      if (user) {
        await database.updateUser(payment.userId, {
          status: CONFIG.USER.STATUS.ACTIVE
        });

        // Handle referral if exists
        if (ctx.session && ctx.session.referredBy) {
          await this.handleReferralCommission(ctx.session.referredBy, payment.userId);
        }

        // Notify user
        await notification.notifyPaymentApproval(payment.userId, paymentId);
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 View Pending Payments', 'admin_pending_payments')],
        [Markup.button.callback('🔙 Admin Dashboard', 'admin_back')],
        [Markup.button.callback('🏠 User Menu', 'main_menu')]
      ]);

      await ctx.editMessageText(`✅ Payment ${paymentId} approved successfully!`, keyboard);
      await ctx.answerCbQuery('Payment approved!');

    } catch (error) {
      console.error('Error approving payment:', error);
      await ctx.answerCbQuery('❌ Error approving payment.');
    }
  }

  async handleReferralCommission(referrerId, referredUserId) {
    try {
      const referrer = await database.getUser(referrerId);
      const referredUser = await database.getUser(referredUserId);

      if (!referrer || !referredUser) return;

      const referralId = `REF_${referrerId}_${referredUserId}_${Date.now()}`;
      const referralData = {
        referralId: referralId,
        referrerId: referrerId,
        referredUserId: referredUserId,
        status: 'completed',
        commissionAmount: CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL,
        date: new Date().toISOString()
      };

      // Save referral record
      await database.createReferral(referralData);

      // Update referrer stats
      const newBalance = referrer.balance + CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL;
      await database.updateUser(referrerId, {
        paidReferrals: referrer.paidReferrals + 1,
        unpaidReferrals: Math.max(0, referrer.unpaidReferrals - 1),
        balance: newBalance,
        totalEarned: referrer.totalEarned + CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL,
        totalReferrals: referrer.totalReferrals + 1
      });

      // Notify referrer
      await notification.notifyReferralEarned(referrerId, referredUserId, CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL);

    } catch (error) {
      console.error('Error handling referral commission:', error);
    }
  }

  async rejectPayment(ctx, paymentId) {
    await ctx.editMessageText(
      `❌ Rejecting payment ${paymentId}\n\n` +
      `Please send the rejection reason:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🚫 Cancel Rejection', 'admin_pending_payments')],
        [Markup.button.callback('🏠 User Menu', 'main_menu')]
      ])
    );
    ctx.session.rejectingPayment = paymentId;
  }

  async handlePaymentRejection(ctx, reason) {
    const paymentId = ctx.session.rejectingPayment;
    
    if (!paymentId) return;

    const payment = await database.getPayment(paymentId);
    if (payment) {
      await database.updatePayment(paymentId, {
        status: CONFIG.PAYMENT.STATUS.REJECTED,
        rejectionReason: reason,
        verifiedBy: ctx.from.username,
        verifiedAt: new Date().toISOString()
      });

      // Notify user
      await notification.notifyPaymentRejection(payment.userId, reason);

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 View Pending Payments', 'admin_pending_payments')],
        [Markup.button.callback('🔙 Admin Dashboard', 'admin_back')],
        [Markup.button.callback('🏠 User Menu', 'main_menu')]
      ]);

      await ctx.reply(`✅ Payment ${paymentId} rejected with reason.`, keyboard);
    }

    ctx.session.rejectingPayment = null;
  }
}

module.exports = new PaymentHandler();

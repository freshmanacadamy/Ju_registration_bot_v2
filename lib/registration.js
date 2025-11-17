const { Markup } = require('telegraf');
const database = require('./database');
const notification = require('./notification');
const { CONFIG } = require('./config');

class RegistrationHandler {
  generateReferralCode(firstName) {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `${firstName.substring(0, 3).toUpperCase()}${randomNum}`;
  }

  async startRegistration(ctx) {
    const userId = ctx.from.id;
    
    // Check if user is already registered
    const existingUser = await database.getUser(userId);
    if (existingUser) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Balance', 'check_balance')],
        [Markup.button.callback('👥 My Referrals', 'show_referrals')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);

      await ctx.replyWithMarkdown(
        `❌ *ALREADY REGISTERED!*\n\n` +
        `You are already registered for JU Tutorial Classes.\n\n` +
        `👤 Your Profile:\n` +
        `• 📝 Name: ${existingUser.fullName}\n` +
        `• 🎓 JU ID: ${existingUser.juId}\n` +
        `• 🏫 Stream: ${existingUser.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n` +
        `• 💰 Status: ${existingUser.status === 'active' ? '✅ Active' : '⏳ Pending'}\n\n` +
        `Use the menu to access your account features.`,
        keyboard
      );
      return;
    }

    // Start registration process
    ctx.session.registration = {
      step: 1,
      data: {}
    };

    const keyboard = Markup.keyboard([
      ['❌ Cancel Registration']
    ]).resize();

    await ctx.replyWithMarkdown(
      `📝 *Registration Form - Step 1/4*\n\n` +
      `Please enter your full name:`,
      keyboard
    );
  }

  async handleRegistrationStep(ctx) {
    const userId = ctx.from.id;
    const session = ctx.session.registration;
    
    if (!session) return;

    switch (session.step) {
      case 1: // Full Name
        if (!ctx.message.text || ctx.message.text.length < 2) {
          await ctx.reply('❌ Please enter a valid full name.');
          return;
        }
        
        session.data.fullName = ctx.message.text.trim();
        session.step = 2;
        
        const contactKeyboard = Markup.keyboard([
          [Markup.button.contactRequest('📞 Share Contact')],
          ['❌ Cancel Registration']
        ]).resize();

        await ctx.replyWithMarkdown(
          `✅ Name saved: ${session.data.fullName}\n\n` +
          `📝 *Registration Form - Step 2/4*\n\n` +
          `Please share your contact number:`,
          contactKeyboard
        );
        break;

      case 2: // Contact Number
        if (!ctx.message.contact) {
          await ctx.reply('❌ Please use the "Share Contact" button.');
          return;
        }
        
        session.data.contactNumber = `+${ctx.message.contact.phone_number}`;
        session.step = 3;
        
        const juIdKeyboard = Markup.keyboard([
          ['❌ Cancel Registration']
        ]).resize();

        await ctx.replyWithMarkdown(
          `✅ Contact saved: ${session.data.contactNumber}\n\n` +
          `📝 *Registration Form - Step 3/4*\n\n` +
          `Please enter your JU ID (Format: RU1234/18):`,
          juIdKeyboard
        );
        break;

      case 3: // JU ID
        const juId = ctx.message.text.trim();
        const juIdRegex = /^RU\d{4}\/\d{2}$/;
        
        if (!juIdRegex.test(juId)) {
          await ctx.reply('❌ Invalid JU ID format. Please use: RU1234/18');
          return;
        }
        
        // Check if JU ID already exists
        const existingUserWithJUId = await database.getUserByJUId(juId);
        if (existingUserWithJUId) {
          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📞 Contact Admin', 'contact_admin')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ]);

          await ctx.reply('❌ This JU ID is already registered. Please contact admin if this is an error.', keyboard);
          return;
        }
        
        session.data.juId = juId;
        session.step = 4;
        
        await ctx.replyWithMarkdown(
          `✅ JU ID saved: ${session.data.juId}\n\n` +
          `📝 *Registration Form - Step 4/4*\n\n` +
          `Select your stream:`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback('🔬 Natural Science', 'stream_natural'),
              Markup.button.callback('📚 Social Science', 'stream_social')
            ],
            [
              Markup.button.callback('❌ Cancel Registration', 'registration_cancel')
            ]
          ])
        );
        break;
    }
  }

  async handleStreamSelection(ctx, stream) {
    const userId = ctx.from.id;
    const session = ctx.session.registration;
    
    if (!session || session.step !== 4) return;

    session.data.stream = stream;
    
    // Generate referral code
    const referralCode = this.generateReferralCode(session.data.fullName);
    
    // Create user data
    const userData = {
      telegramId: userId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name || '',
      ...session.data,
      referralCode: referralCode,
      language: 'en',
      status: CONFIG.USER.STATUS.PENDING,
      balance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      paidReferrals: 0,
      unpaidReferrals: 0,
      totalReferrals: 0,
      registrationDate: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    try {
      // Save user to database
      await database.createUser(userData);
      
      // Clear session
      ctx.session.registration = null;
      
      // Notify admin
      await notification.notifyNewRegistration(userId, userData);
      
      // Show payment instructions
      await this.showPaymentInstructions(ctx, userData);
      
    } catch (error) {
      console.error('Error completing registration:', error);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Try Again', 'main_menu')],
        [Markup.button.callback('📞 Contact Admin', 'contact_admin')]
      ]);

      await ctx.reply('❌ Error completing registration. Please try again or contact admin.', keyboard);
    }
  }

  async showPaymentInstructions(ctx, userData) {
    const { botSettings } = require('./config');
    
    let paymentMethodsText = '';
    Object.entries(botSettings.payment_methods).forEach(([method, data]) => {
      if (data.active) {
        paymentMethodsText += `📱 *${method.toUpperCase()}*\n` +
          `Account: \`${data.account_number}\`\n` +
          `Name: ${data.account_name}\n` +
          `Instructions: ${data.instructions}\n\n`;
      }
    });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📸 Send Payment Screenshot', 'send_payment')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')],
      [Markup.button.callback('📞 Contact Admin', 'contact_admin')]
    ]);

    await ctx.replyWithMarkdown(
      `✅ *REGISTRATION COMPLETE!*\n\n` +
      `Your information has been saved:\n` +
      `• 📝 Name: ${userData.fullName}\n` +
      `• 🎓 JU ID: ${userData.juId}\n` +
      `• 🏫 Stream: ${userData.stream === 'natural' ? '🔬 Natural Science' : '📚 Social Science'}\n\n` +
      `💰 *Payment Required:*\n` +
      `Registration Fee: ${CONFIG.PAYMENT.DEFAULT_AMOUNT} ETB\n\n` +
      `${paymentMethodsText}` +
      `*After payment, send the screenshot as a photo to complete your registration.*`,
      keyboard
    );
  }

  async handleReferralStart(ctx) {
    const referredBy = ctx.startPayload; // Get referral code from deep link
    
    if (referredBy) {
      // Find referrer by code
      const allStudents = await database.getAllStudents();
      const referrer = allStudents.find(s => s.referralCode === referredBy);
      
      if (referrer) {
        // Store referral information in session
        ctx.session.referredBy = referrer.telegramId;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📝 Register Now', 'start_registration')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ]);

        await ctx.replyWithMarkdown(
          `👋 You were invited by ${referrer.fullName}!\n\n` +
          `Complete your registration and both of you will benefit from our referral program!\n\n` +
          `💰 *Earn ${CONFIG.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB* when you complete registration!`,
          keyboard
        );
      }
    }
  }
}

// Add action for start registration from referral
const bot = require('./bot');
bot.action('start_registration', async (ctx) => {
  await ctx.answerCbQuery('📝 Starting registration...');
  const registration = require('./registration');
  await registration.startRegistration(ctx);
});

bot.action('send_payment', async (ctx) => {
  await ctx.answerCbQuery('📸 Ready for payment screenshot...');
  await ctx.reply('📸 Please send your payment screenshot as a photo.');
});

module.exports = new RegistrationHandler();

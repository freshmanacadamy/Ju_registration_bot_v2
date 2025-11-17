const { db, CONFIG } = require('./config');

class DatabaseService {
  // User Management
  async getUser(userId) {
    try {
      const userDoc = await db.collection('students').doc(userId.toString()).get();
      return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async createUser(userData) {
    try {
      await db.collection('students').doc(userData.telegramId.toString()).set(userData);
      return userData;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId, updates) {
    try {
      updates.lastSeen = new Date().toISOString();
      await db.collection('students').doc(userId.toString()).update(updates);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async getUserByJUId(juId) {
    try {
      const usersSnapshot = await db.collection('students')
        .where('juId', '==', juId)
        .get();
      
      if (!usersSnapshot.empty) {
        return usersSnapshot.docs[0].data();
      }
      return null;
    } catch (error) {
      console.error('Error getting user by JU ID:', error);
      return null;
    }
  }

  // Payment Management
  async createPayment(paymentData) {
    try {
      await db.collection('payments').doc(paymentData.paymentId).set(paymentData);
      return paymentData;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  async getPayment(paymentId) {
    try {
      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      return paymentDoc.exists ? paymentDoc.data() : null;
    } catch (error) {
      console.error('Error getting payment:', error);
      return null;
    }
  }

  async updatePayment(paymentId, updates) {
    try {
      await db.collection('payments').doc(paymentId).update(updates);
    } catch (error) {
      console.error('Error updating payment:', error);
      throw error;
    }
  }

  async getPendingPayments() {
    try {
      const paymentsSnapshot = await db.collection('payments')
        .where('status', '==', CONFIG.PAYMENT.STATUS.PENDING)
        .orderBy('submittedAt', 'asc')
        .get();

      return paymentsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting pending payments:', error);
      return [];
    }
  }

  async getPaymentsByUser(userId) {
    try {
      const paymentsSnapshot = await db.collection('payments')
        .where('userId', '==', userId)
        .get();
      return paymentsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting user payments:', error);
      return [];
    }
  }

  // Referral Management
  async createReferral(referralData) {
    try {
      await db.collection('referrals').doc(referralData.referralId).set(referralData);
    } catch (error) {
      console.error('Error creating referral:', error);
      throw error;
    }
  }

  async getReferralsByReferrer(referrerId) {
    try {
      const referralsSnapshot = await db.collection('referrals')
        .where('referrerId', '==', referrerId)
        .get();

      return referralsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting referrals:', error);
      return [];
    }
  }

  // Withdrawal Management
  async createWithdrawal(withdrawalData) {
    try {
      await db.collection('withdrawals').doc(withdrawalData.withdrawalId).set(withdrawalData);
      return withdrawalData;
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      throw error;
    }
  }

  async getWithdrawal(withdrawalId) {
    try {
      const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
      return withdrawalDoc.exists ? withdrawalDoc.data() : null;
    } catch (error) {
      console.error('Error getting withdrawal:', error);
      return null;
    }
  }

  async updateWithdrawal(withdrawalId, updates) {
    try {
      await db.collection('withdrawals').doc(withdrawalId).update(updates);
    } catch (error) {
      console.error('Error updating withdrawal:', error);
      throw error;
    }
  }

  async getPendingWithdrawals() {
    try {
      const withdrawalsSnapshot = await db.collection('withdrawals')
        .where('status', '==', CONFIG.WITHDRAWAL.STATUS.PENDING)
        .orderBy('requestedAt', 'asc')
        .get();

      return withdrawalsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      return [];
    }
  }

  async getWithdrawalsByUser(userId) {
    try {
      const withdrawalsSnapshot = await db.collection('withdrawals')
        .where('userId', '==', userId)
        .get();
      return withdrawalsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting user withdrawals:', error);
      return [];
    }
  }

  // Admin Functions
  async getAllStudents() {
    try {
      const studentsSnapshot = await db.collection('students').get();
      return studentsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting all students:', error);
      return [];
    }
  }

  async getStudentsByStream(stream) {
    try {
      const studentsSnapshot = await db.collection('students')
        .where('stream', '==', stream)
        .get();
      return studentsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting students by stream:', error);
      return [];
    }
  }

  async deleteStudent(userId) {
    try {
      await db.collection('students').doc(userId.toString()).delete();
      
      // Also delete associated payments and referrals
      const paymentsSnapshot = await db.collection('payments')
        .where('userId', '==', userId)
        .get();
      
      const deletePromises = paymentsSnapshot.docs.map(doc => doc.ref.delete());
      await Promise.all(deletePromises);
      
    } catch (error) {
      console.error('Error deleting student:', error);
      throw error;
    }
  }

  // Analytics
  async getTotalRevenue() {
    try {
      const paymentsSnapshot = await db.collection('payments')
        .where('status', '==', CONFIG.PAYMENT.STATUS.APPROVED)
        .get();
      
      return paymentsSnapshot.docs.reduce((total, doc) => {
        return total + (doc.data().amount || 0);
      }, 0);
    } catch (error) {
      console.error('Error calculating revenue:', error);
      return 0;
    }
  }
}

module.exports = new DatabaseService();

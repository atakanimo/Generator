/** English texts; same keys as `tr.ts`. */
const en = {
  common: {
    serviceUnavailable: 'Service unavailable',
    success: 'Success',
    failed: 'Failed',
    error: 'Error',
    unauthorized: 'Unauthorized',
    forbidden: 'Forbidden',
    badRequest: 'Bad Request',
    notFound: 'Not Found',
    invalidJson: 'Request body is not valid JSON',
    internalServerError: 'Internal Server Error',
    duplicateValue: 'The value you are trying to add is already present'
  },
  crud: {
    listFailed: 'Failed to get records',
    getByIdFailed: 'Failed to get the record',
    createFailed: 'Failed to create the record',
    updateFailed: 'Failed to update the record',
    deleteFailed: 'Failed to delete the record',
    notFound: 'Record not found or unauthorized',
    deleteSuccess: 'Record deleted successfully',
    exportUnknownField: 'Cannot export this field: {{field}}',
    exportHeaders: '`headers` must have as many items as `fields`.',
    exportTooMany: 'Too many records to export; at most {{limit}}. Narrow the filters.'
  },
  auth: {
    noToken: 'No token provided',
    invalidToken: 'Invalid or expired token',
    invalidCredentials: 'Wrong e-mail or password',
    suspended: 'Account is suspended',
    emailNotVerified: 'E-mail address is not verified',
    loggedIn: 'Signed in',
    loggedOut: 'Signed out',
    wrongPassword: 'Current password is wrong',
    passwordChanged: 'Password updated',
    passwordTooShort: 'Password must be at least 8 characters',
    passwordTooLong: 'Password is too long (at most 72 bytes)',
    passwordWeak: 'Password must contain a letter and a digit',
    otpSent: 'A verification code was sent to the e-mail address',
    invalidCode: 'Code is invalid or expired',
    emailVerified: 'E-mail verified',
    emailRequired: 'The provider did not share an e-mail address',
    emailInUse: 'This e-mail belongs to another account; sign in with that account',
    accountDeleted: 'Account deleted',
    adminNotAllowed: 'This action is not available for admin accounts',
    adminPasswordOnly: 'Admin accounts sign in with e-mail and password only',
    passwordAlreadySet: 'This account already has a password; use change password',
    passwordCreated: 'Password created',
    mail: {
      verifySubject: '__App__ verification code',
      resetSubject: '__App__ password reset code',
      codeText: 'Your code: {{code}}. Valid for {{minutes}} minutes.'
    }
  },
  rateLimit: {
    tooManyRequests: 'Too Many Requests',
    retryLater: 'Too many requests; try again later'
  }
};

export default en;

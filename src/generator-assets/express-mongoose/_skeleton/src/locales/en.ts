/** English texts; same keys as `tr.ts`. */
const en = {
  common: {
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
    deleteSuccess: 'Record deleted successfully'
  },
  auth: {
    noToken: 'No token provided',
    invalidToken: 'Invalid or expired token'
  },
  rateLimit: {
    tooManyRequests: 'Too Many Requests'
  }
};

export default en;

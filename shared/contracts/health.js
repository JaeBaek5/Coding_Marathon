export const healthContract = {
  path: '/api/health',
  method: 'GET',
  response: {
    status: 200,
    body: {
      status: 'ok',
      service: 'mumuk-api',
      version: '0.1.0'
    }
  }
};

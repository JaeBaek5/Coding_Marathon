import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { healthContract } from '../../../shared/contracts/health.js';

describe('GET /api/health contract', () => {
  it('should match the health contract', async () => {
    const response = await request(app)
      .get(healthContract.path)
      .expect(healthContract.response.status);

    expect(response.body).toEqual(healthContract.response.body);
  });
});

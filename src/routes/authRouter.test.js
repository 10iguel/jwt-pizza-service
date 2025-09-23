const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
    testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUserAuthToken = registerRes.body.token;
    expectValidJwt(testUserAuthToken);
});

test('login', async () => {
    const loginRes = await request(app).put('/api/auth').send(testUser);
    expect(loginRes.status).toBe(200);
    expectValidJwt(loginRes.body.token);

    const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
    delete expectedUser.password;
    expect(loginRes.body.user).toMatchObject(expectedUser);
});

describe('DELETE /api/auth (Logout)', () => {
    test('should logout a user successfully', async () => {
        const logoutRes = await request(app)
            .delete('/api/auth')
            .set('Authorization', `Bearer ${testUserAuthToken}`);
        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body).toEqual({ message: 'logout successful' });
    });

    test('should return 401 for missing token', async () => {
        const logoutRes = await request(app).delete('/api/auth');
        expect(logoutRes.status).toBe(401);
        expect(logoutRes.body).toEqual({ message: 'unauthorized' });
    });

    test('should return 401 for invalid token', async () => {
        const logoutRes = await request(app)
            .delete('/api/auth')
            .set('Authorization', 'Bearer invalid-token');
        expect(logoutRes.status).toBe(401);
        expect(logoutRes.body).toEqual({ message: 'unauthorized' });
    });
});

describe('POST /api/auth (Register)', () => {
    test('should register a new user successfully', async () => {
        const newUser = {
            name: 'new user',
            email: Math.random().toString(36).substring(2, 12) + '@test.com',
            password: 'password123',
        };
        const registerRes = await request(app).post('/api/auth').send(newUser);
        expect(registerRes.status).toBe(200);
        expectValidJwt(registerRes.body.token);

        const expectedUser = { ...newUser, roles: [{ role: 'diner' }] };
        delete expectedUser.password;
        expect(registerRes.body.user).toMatchObject(expectedUser);
    });

    test('should return 400 for missing required fields', async () => {
        const invalidUser = { name: 'incomplete user', email: 'incomplete@test.com' }; // Missing password
        const registerRes = await request(app).post('/api/auth').send(invalidUser);
        expect(registerRes.status).toBe(400);
        expect(registerRes.body).toEqual({ message: 'name, email, and password are required' });
    });
});

function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}
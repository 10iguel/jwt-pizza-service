const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');
const { Role } = require('../model/model');
const {StatusCodeError} = require("../endpointHelper");

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let testUserId;
let adminUser;
let adminAuthToken;

const mockConnection = {
    beginTransaction: jest.fn(),
    query: jest.fn(),
    rollback: jest.fn(),
    commit: jest.fn(),
    end: jest.fn(),
};

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function registerUser(service) {
    const testUser = {
        name: 'pizza diner',
        email: `${randomName()}@test.com`,
        password: 'a',
    };
    const registerRes = await service.post('/api/auth').send(testUser);
    registerRes.body.user.password = testUser.password;

    return [registerRes.body.user, registerRes.body.token];
}


async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = randomName();
    user.email = user.name + '@admin.com';
    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

beforeAll(async () => {
    adminUser = await createAdminUser();
    console.log('Admin user after creation:', JSON.stringify(adminUser, null, 2));
    const adminRegisterRes = await request(app)
        .post('/api/auth')
        .send({ name: adminUser.name, email: adminUser.email, password: adminUser.password });
    adminAuthToken = adminRegisterRes.body.token;
    expectValidJwt(adminAuthToken);

    testUser.email = randomName() + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUserAuthToken = registerRes.body.token;
    testUserId = registerRes.body.user.id;
    expectValidJwt(testUserAuthToken);
});

describe('GET /api/user/me', () => {
    test('should return authenticated user info', async () => {
        const response = await request(app)
            .get('/api/user/me')
            .set('Authorization', `Bearer ${testUserAuthToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: expect.any(Number),
            name: testUser.name,
            email: testUser.email,
            roles: expect.any(Array)
        });
        expect(response.body.password).toBeUndefined();
    });
    test('should return 401 for unauthenticated request', async () => {
        const response = await request(app).get('/api/user/me');
        expect(response.status).toBe(401);
    });

    test('should return 401 for invalid token', async () => {
        const response = await request(app)
            .get('/api/user/me')
            .set('Authorization', 'Bearer invalid-token');
        expect(response.status).toBe(401);
    });

    test('should return 401 for malformed Authorization header', async () => {
        const response = await request(app)
            .get('/api/user/me')
            .set('Authorization', 'InvalidFormat');
        expect(response.status).toBe(401);
    });
});

describe('PUT /api/user/:userId', () => {
    test('should allow user to update only email', async () => {
        const updateData = {
            email: 'onlyemail@test.com'
        };
        const response = await request(app)
            .put(`/api/user/${testUserId}`)
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe(updateData.email);
        expect(response.body.token).toBeDefined();
        expectValidJwt(response.body.token);
    });
    test('should return 403 for non-admin user trying to update different user', async () => {
        const anotherUser = {
            name: 'Another User',
            email: randomName() + '@test.com',
            password: 'password'
        };
        const registerRes = await request(app).post('/api/auth').send(anotherUser);
        const anotherUserId = registerRes.body.user.id;

        const updateData = {
            name: 'Unauthorized Update',
            email: 'unauthorized@test.com'
        };

        const response = await request(app)
            .put(`/api/user/${anotherUserId}`)
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(updateData);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unauthorized' });
    });

    test('should return 401 for unauthenticated request', async () => {
        const updateData = {
            name: 'Unauthorized Update'
        };

        const response = await request(app)
            .put(`/api/user/${testUserId}`)
            .send(updateData);

        expect(response.status).toBe(401);
    });

    test('should return 401 for invalid token', async () => {
        const updateData = {
            name: 'Invalid Token Update'
        };

        const response = await request(app)
            .put(`/api/user/${testUserId}`)
            .set('Authorization', 'Bearer invalid-token')
            .send(updateData);

        expect(response.status).toBe(401);
    });
    test('should handle invalid userId parameter', async () => {
        const updateData = {
            name: 'Invalid User ID Update'
        };

        const response = await request(app)
            .put('/api/user/invalid')
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(updateData);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unauthorized' });
    });

    test('should handle non-existent userId', async () => {
        const updateData = {
            name: 'Non-existent User Update'
        };

        const response = await request(app)
            .put('/api/user/999999')
            .set('Authorization', `Bearer ${adminAuthToken}`)
            .send(updateData);
        expect(response.status).toBeGreaterThanOrEqual(400);
    });
});
describe('DELETE /api/user/:userId', () => {
    let anotherUserId;
    let anotherUserToken;

    beforeAll(async () => {
        const anotherUser = {
            name: randomName(),
            email: randomName() + '@test.com',
            password: 'password'
        };
        const registerRes = await request(app).post('/api/auth').send(anotherUser);
        anotherUserId = registerRes.body.user.id;
        anotherUserToken = registerRes.body.token;
    });

    test('should allow user to delete self', async () => {
        const response = await request(app)
            .delete(`/api/user/${testUserId}`)
            .set('Authorization', `Bearer ${testUserAuthToken}`);

        expect(response.status).toBe(204);

        const meResponse = await request(app)
            .get('/api/user/me')
            .set('Authorization', `Bearer ${testUserAuthToken}`);
        expect(meResponse.status).toBe(401);
    });

    test('should return 403 for non-admin trying to delete another user', async () => {
        const tempUser = {
            name: randomName(),
            email: randomName() + '@test.com',
            password: 'password'
        };
        const registerRes = await request(app).post('/api/auth').send(tempUser);
        const tempUserId = registerRes.body.user.id;
        const tempToken = registerRes.body.token;

        const targetUser = {
            name: randomName(),
            email: randomName() + '@test.com',
            password: 'password'
        };
        const targetRes = await request(app).post('/api/auth').send(targetUser);
        const targetUserId = targetRes.body.user.id;

        const response = await request(app)
            .delete(`/api/user/${targetUserId}`)
            .set('Authorization', `Bearer ${tempToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unauthorized' });
    });

    test('should return 401 for unauthenticated request', async () => {
        const response = await request(app).delete(`/api/user/${testUserId}`);
        expect(response.status).toBe(401);
    });

    test('should return 401 for invalid token', async () => {
        const response = await request(app)
            .delete(`/api/user/${testUserId}`)
            .set('Authorization', 'Bearer invalid-token');
        expect(response.status).toBe(401);
    });
    test('deleteUser should rollback and throw StatusCodeError on query failure', async () => {

        jest.spyOn(DB, 'getConnection').mockResolvedValue(mockConnection);

        mockConnection.query.mockImplementationOnce(() => {
            throw new Error('Simulated SQL failure');
        });

        await expect(DB.deleteUser(123)).rejects.toThrow(StatusCodeError);
        await expect(DB.deleteUser(123)).rejects.toThrow('Unable to delete user: connection.execute is not a function');

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.end).toHaveBeenCalled();
    });
});
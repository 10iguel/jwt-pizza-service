const request = require('supertest');
const app = require('../service');
const {DB} = require("../database/database.js");
const {Role} = require("../model/model");

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let adminUser;
let adminAuthToken;

function randomName() {
    return Math.random().toString(36).substring(2, 12);
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
    const adminRegisterRes = await request(app)
        .post('/api/auth')
        .send({ name: adminUser.name, email: adminUser.email, password: adminUser.password });
    adminAuthToken = adminRegisterRes.body.token;
    expectValidJwt(adminAuthToken);
});

describe('POST /api/franchise', () => {
    test('should return 403 for non-admin user', async () => {
        testUser.email = randomName() + '@test.com';
        const registerRes = await request(app).post('/api/auth').send(testUser);
        testUserAuthToken = registerRes.body.token;
        expectValidJwt(testUserAuthToken);
        const newFranchise = { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com' }] };
        const response = await request(app)
            .post('/api/franchise')
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(newFranchise);
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unable to create a franchise', stack: expect.any(String) });
    });
});


describe('GET /api/franchise', () => {
    test('should list franchises with pagination and name filter', async () => {
        const mockFranchises = [
            { id: 1, name: 'pizzaPocket', admins: [{ id: 4, name: 'pizza franchisee', email: 'f@jwt.com' }], stores: [{ id: 1, name: 'SLC', totalRevenue: 0 }] },
        ];
        DB.getFranchises = jest.fn().mockResolvedValue([mockFranchises, true]);

        const response = await request(app)
            .get('/api/franchise?page=0&limit=10&name=pizzaPocket')
            .set('Authorization', `Bearer ${testUserAuthToken}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ franchises: mockFranchises, more: true });
        expect(DB.getFranchises).toHaveBeenCalledWith(expect.any(Object), '0', '10', 'pizzaPocket');
    });
    test('should list franchises without authentication', async () => {
        const mockFranchises = [
            { id: 1, name: 'publicFranchise', admins: [], stores: [] },
        ];
        DB.getFranchises = jest.fn().mockResolvedValue([mockFranchises, false]);

        const response = await request(app).get('/api/franchise');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ franchises: mockFranchises, more: false });
    });
});

describe('GET /api/franchise/:userId', () => {
    test('should return 401 for unauthorized access', async () => {
        const response = await request(app).get(`/api/franchise/${adminUser.id}`);
        expect(response.status).toBe(401);
    });
    test('should return empty array for different user (non-admin)', async () => {
        const anotherUser = { name: 'another user', email: randomName() + '@test.com', password: 'password' };
        const registerRes = await request(app).post('/api/auth').send(anotherUser);
        const anotherUserToken = registerRes.body.token;

        const response = await request(app)
            .get(`/api/franchise/${adminUser.id}`)
            .set('Authorization', `Bearer ${anotherUserToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });
})

describe('DELETE /api/franchise/:franchiseId', () => {
    test('should delete a franchise', async () => {
        const resCreate = await request(app)
            .post('/api/franchise')
            .set('Authorization', `Bearer ${adminAuthToken}`)
            .send({
                name: randomName(),
                admins: [{ email: adminUser.email }]
            });
        const franchiseId = resCreate.body.id;

        const resDelete = await request(app)
            .delete(`/api/franchise/${franchiseId}`)
            .set('Authorization', `Bearer ${adminAuthToken}`);

        expect(resDelete.statusCode).toBe(200);
        expect(resDelete.body).toEqual({ message: 'franchise deleted' });
    });
});
describe('POST /api/franchise/:franchiseId/store', () => {
    test('should return 401 for unauthenticated request', async () => {
        const storeData = { name: 'Unauthorized Store' };
        const response = await request(app)
            .post('/api/franchise/1/store')
            .send(storeData);

        expect(response.status).toBe(401);
    });

    test('should return 403 for non-existent franchise', async () => {
        const storeData = { name: 'Store for non-existent franchise' };
        const response = await request(app)
            .post('/api/franchise/999999/store')
            .set('Authorization', `Bearer ${adminAuthToken}`)
            .send(storeData);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unable to create a store', stack: expect.any(String) });
    });
});

describe('DELETE /api/franchise/:franchiseId/store/:storeId', () => {
    test('should return 401 for unauthenticated request', async () => {
        const response = await request(app)
            .delete('/api/franchise/1/store/1');

        expect(response.status).toBe(401);
    });

    test('should return 403 for non-existent franchise', async () => {
        const response = await request(app)
            .delete('/api/franchise/999999/store/1')
            .set('Authorization', `Bearer ${adminAuthToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'unable to delete a store', stack: expect.any(String) });
    });
});
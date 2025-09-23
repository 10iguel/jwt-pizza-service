const request = require('supertest');
const app = require('../service');
const {DB} = require("../database/database.js");
const {Role} = require("../model/model");

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let adminUser;
let adminAuthToken;

beforeAll(async () => {
    testUser.email = 'user@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUserAuthToken = registerRes.body.token;
    expectValidJwt(testUserAuthToken);

    // Register an admin user
    adminUser = {
        name: 'admin user',
        email:  'admin@test.com',
        password: 'admin123',
        roles: [{ role: Role.Admin }],
    };
    const adminRegisterRes = await request(app)
        .post('/api/auth')
        .send(adminUser);
    adminAuthToken = adminRegisterRes.body.token;
    expectValidJwt(adminAuthToken);
});

describe('GET /api/franchise', () => {
    test('should list franchises with pagination and name filter', async () => {

        const mockFranchises = [
            { id: 1, name: 'pizzaPocket', admins: [{ id: 4, name: 'pizza franchisee', email: 'f@jwt.com' }], stores: [{ id: 1, name: 'SLC', totalRevenue: 0 }] },
        ];
        DB.getFranchises.mockResolvedValue([mockFranchises, true]);

        const response = await request(app)
            .get('/api/franchise?page=0&limit=10&name=pizzaPocket')
            .set('Authorization', `Bearer ${testUserAuthToken}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ franchises: mockFranchises, more: true });
        expect(DB.getFranchises).toHaveBeenCalledWith(expect.any(Object), '0', '10', 'pizzaPocket');
    });
});




async function createAdminUser() {
    let user = {password: "sosecret", roles: [{role: Role.Admin}]};
    user = await DB.addUser(user);
    return user;
}
function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}
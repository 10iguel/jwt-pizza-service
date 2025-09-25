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
    user.isRole = (role) => role === Role.Admin;
    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}
function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

beforeAll(async () => {
    testUser.email = randomName() + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUserAuthToken = registerRes.body.token;
    expectValidJwt(testUserAuthToken);
    adminUser = await createAdminUser();
    console.log('Admin user after creation:', JSON.stringify(adminUser, null, 2));
    const adminRegisterRes = await request(app)
        .post('/api/auth')
        .send({ name: adminUser.name, email: adminUser.email, password: adminUser.password });
    adminAuthToken = adminRegisterRes.body.token;
    expectValidJwt(adminAuthToken);
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
});

describe('GET /api/franchise/:userId', () => {
    test('should return 401 for unauthorized access', async () => {
        const response = await request(app).get(`/api/franchise/${adminUser.id}`);
        expect(response.status).toBe(401);
    });
})

// describe('POST /api/franchise', () => {
//     test('should create a franchise with an existing admin', async () => {
//         console.log(adminUser.isRole)
//         jest.spyOn(adminUser, 'isRole').mockImplementation((role) => role === Role.Admin);
//
//         const franchiseData = {
//             name: randomName(),
//             admins: [{ email: adminUser.email }],
//         };
//         const res = await request(app)
//             .post('/api/franchise')
//             .set('Authorization', `Bearer ${adminAuthToken}`)
//             .send({
//                 franchiseData
//             });
//
//         expect(res.statusCode).toBe(200);
//         expect(res.body).toHaveProperty('id');
//         expect(res.body).toHaveProperty('name', franchiseName);
//         expect(res.body.admins[0]).toHaveProperty('email', adminUser.email);
//     });
//
//     test('should return 403 for non-admin user', async () => {
//         const newFranchise = { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com' }] };
//         const response = await request(app)
//             .post('/api/franchise')
//             .set('Authorization', `Bearer ${testUserAuthToken}`)
//             .send(newFranchise);
//         expect(response.status).toBe(403);
//         expect(response.body).toEqual({ message: 'unable to create a franchise', stack: expect.any(String) });
//     });
// });


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
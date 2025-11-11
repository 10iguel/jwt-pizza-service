const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');
const { Role } = require('../model/model');
const config = require('../config.js');

// Mock fetch for factory API calls
global.fetch = jest.fn();

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let testUserId;
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
    // console.log('Admin user after creation:', JSON.stringify(adminUser, null, 2));
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

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /api/order/menu', () => {
    test('should return pizza menu without authentication', async () => {
        const mockMenu = [
            { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
            { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy goodness' }
        ];

        DB.getMenu = jest.fn().mockResolvedValue(mockMenu);

        const response = await request(app).get('/api/order/menu');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockMenu);
        expect(DB.getMenu).toHaveBeenCalledTimes(1);
    });
});

describe('PUT /api/order/menu', () => {
    test('should return 403 for non-admin user', async () => {
        const newMenuItem = {
            title: 'Unauthorized Pizza',
            description: 'This should not be added',
            image: 'pizza10.png',
            price: 0.001
        };

        const response = await request(app)
            .put('/api/order/menu')
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(newMenuItem);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            message: 'unable to add menu item',
            stack: expect.any(String)
        });
    });
});

describe('GET /api/order', () => {
    test('should return user orders with pagination', async () => {
        const mockOrders = {
            dinerId: testUserId,
            orders: [
                {
                    id: 1,
                    franchiseId: 1,
                    storeId: 1,
                    date: '2024-06-05T05:14:40.000Z',
                    items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }]
                }
            ],
            page: 1
        };

        DB.getOrders = jest.fn().mockResolvedValue(mockOrders);

        const response = await request(app)
            .get('/api/order?page=1')
            .set('Authorization', `Bearer ${testUserAuthToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockOrders);
        expect(DB.getOrders).toHaveBeenCalledWith(expect.any(Object), '1');
    });
    test('should return 401 for unauthenticated request', async () => {
        const response = await request(app).get('/api/order');
        expect(response.status).toBe(401);
    });
});

describe('POST /api/order', () => {
    test('should create order successfully', async () => {
        const orderRequest = {
            franchiseId: 1,
            storeId: 1,
            items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
        };

        const mockOrder = {
            franchiseId: 1,
            storeId: 1,
            items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
        };

        const mockFactoryResponse = {
            jwt: '1111111111',
            reportUrl: 'https://factory.com/report/123'
        };

        DB.addDinerOrder = jest.fn().mockResolvedValue(mockOrder);

        fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockFactoryResponse)
        });

        const response = await request(app)
            .post('/api/order')
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(orderRequest);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            order: mockOrder,
            followLinkToEndChaos: mockFactoryResponse.reportUrl,
            jwt: mockFactoryResponse.jwt
        });

        expect(DB.addDinerOrder).toHaveBeenCalledWith(expect.any(Object), orderRequest);
        expect(fetch).toHaveBeenCalledWith(
            `${config.factory.url}/api/order`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authorization: `Bearer ${config.factory.apiKey}`
                },
                body: JSON.stringify({
                    diner: {
                        id: testUserId,
                        name: testUser.name,
                        email: testUser.email
                    },
                    order: mockOrder
                })
            }
        );
    });

    test('should handle factory service failure', async () => {
        const orderRequest = {
            franchiseId: 1,
            storeId: 1,
            items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
        };

        const mockOrder = {
            id: 1,
            franchiseId: 1,
            storeId: 1,
            items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
        };

        const mockFactoryErrorResponse = {
            reportUrl: 'https://factory.com/error-report/123'
        };

        DB.addDinerOrder = jest.fn().mockResolvedValue(mockOrder);

        fetch.mockResolvedValue({
            ok: false,
            json: jest.fn().mockResolvedValue(mockFactoryErrorResponse)
        });

        const response = await request(app)
            .post('/api/order')
            .set('Authorization', `Bearer ${testUserAuthToken}`)
            .send(orderRequest);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            message: 'Failed to fulfill order at factory',
            followLinkToEndChaos: mockFactoryErrorResponse.reportUrl
        });
    });
});
const request = require('supertest');
const express = require('express');
const { DB } = require('../database/database');

const mockAuthRouter = express.Router();
mockAuthRouter.authenticateToken = (req, res, next) => {
    req.user = {
        id: 1,
        name: 'Admin Tester',
        email: 'admin@test.com',
        isRole: (role) => role === 'admin',
    };
    next();
};

jest.mock('../routes/authRouter', () => {
    return {
        authRouter: mockAuthRouter,
        setAuthUser: (req, res, next) => next(),
        setAuth: jest.fn(),
    };
});

const app = require('../service');
const {Role} = require("../model/model");

describe('GET /api/user (Admin only)', () => {

    beforeAll(() => {
        jest.spyOn(DB, 'getUsers').mockImplementation(async () => {
            return {
                users: [
                    { id: 1, name: 'Admin Tester', email: 'admin@test.com', roles: [{ role: 'admin' }] },
                    { id: 2, name: 'Regular User', email: 'user@test.com', roles: [{ role: 'user' }] },
                ],
                more: false,
            };
        });
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it('should return a list of users when accessed by an admin', async () => {
        const res = await request(app)
            .get('/api/user')
            .set('Authorization', 'Bearer mocktoken');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(res.body.users.length).toBe(2);
    });

    it('should return 403 if the user is not an admin', async () => {
        jest.resetModules();

        const express = require('express');
        const mockAuthRouter = express.Router();
        mockAuthRouter.authenticateToken = (req, res, next) => {
            req.user = {
                id: 2,
                name: 'Regular User',
                email: 'user@test.com',
                isRole: (role) => role !== Role.Admin,
            };
            next();
        };

        jest.doMock('../routes/authRouter', () => ({
            authRouter: mockAuthRouter,
            setAuthUser: (req, res, next) => next(),
            setAuth: jest.fn(),
        }));

        const app = require('../service');
        const res = await request(app)
            .get('/api/user')
            .set('Authorization', 'Bearer mocktoken');

        expect(res.statusCode).toBe(403);
        expect(res.body).toHaveProperty('message', 'unauthorized');
    });

});


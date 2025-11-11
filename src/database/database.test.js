jest.mock('mysql2/promise');
jest.mock('bcrypt');
jest.mock('../config.js', () => ({
    db: {
        connection: {
            host: 'localhost',
            user: 'testuser',
            password: 'testpass',
            database: 'testdb',
            connectTimeout: 60000
        },
        listPerPage: 10
    }
}));
jest.mock('./dbModel.js', () => ({
    tableCreateStatements: [
        'CREATE TABLE user (...)',
        'CREATE TABLE franchise (...)'
    ]
}));

jest.mock('../logger.js', () => ({
    databaseQueryLog: jest.fn().mockImplementation(() => {}),
}));

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { StatusCodeError } = require('../endpointHelper.js');

const { DB, Role } = require('../database/database.js');

describe('Database Tests', () => {
    let mockConnection;

    beforeAll(async () => {
        await DB.initialized;
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockConnection = {
            execute: jest.fn(),
            query: jest.fn(),
            end: jest.fn(),
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn()
        };

        mysql.createConnection.mockResolvedValue(mockConnection);
        bcrypt.hash.mockResolvedValue('hashedPassword123');
        bcrypt.compare.mockResolvedValue(true);
    });

    afterEach(async () => {
        await mockConnection.end();
    });

    describe('getMenu', () => {
        test('should return menu items successfully', async () => {
            const mockMenu = [
                { id: 1, title: 'Veggie', description: 'Garden delight', image: 'pizza1.png', price: 0.0038 },
                { id: 2, title: 'Pepperoni', description: 'Spicy goodness', image: 'pizza2.png', price: 0.0042 }
            ];

            mockConnection.execute.mockResolvedValue([mockMenu]);

            const result = await DB.getMenu();

            expect(result).toEqual(mockMenu);
            expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM menu', undefined);
            expect(mockConnection.end).toHaveBeenCalled();
        });

        test('should return empty array when no menu items exist', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await DB.getMenu();

            expect(result).toEqual([]);
            expect(mockConnection.end).toHaveBeenCalled();
        });

        test('should close connection even if query fails', async () => {
            mockConnection.execute.mockRejectedValue(new Error('Database error'));

            await expect(DB.getMenu()).rejects.toThrow('Database error');
            expect(mockConnection.end).toHaveBeenCalled();
        });
    });

    describe('addMenuItem', () => {
        test('should add menu item successfully', async () => {
            const newItem = {
                title: 'Student',
                description: 'No topping, no sauce, just carbs',
                image: 'pizza9.png',
                price: 0.0001
            };

            const mockInsertResult = { insertId: 5 };
            mockConnection.execute.mockResolvedValue([mockInsertResult]);

            const result = await DB.addMenuItem(newItem);

            expect(result).toEqual({ ...newItem, id: 5 });
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)',
                [newItem.title, newItem.description, newItem.image, newItem.price]
            );
            expect(mockConnection.end).toHaveBeenCalled();
        });

        test('should handle database errors', async () => {
            const newItem = { title: 'Test', description: 'Test', image: 'test.png', price: 0.01 };
            mockConnection.execute.mockRejectedValue(new Error('Insert failed'));

            await expect(DB.addMenuItem(newItem)).rejects.toThrow('Insert failed');
            expect(mockConnection.end).toHaveBeenCalled();
        });
    });

    describe('addUser', () => {
        test('should add user with admin role successfully', async () => {
            const newUser = {
                name: 'Test User',
                email: 'test@test.com',
                password: 'password',
                roles: [{ role: Role.Admin }]
            };

            const mockUserInsert = { insertId: 10 };
            mockConnection.execute
                .mockResolvedValueOnce([mockUserInsert])
                .mockResolvedValueOnce([{}]);

            const result = await DB.addUser(newUser);

            expect(result).toEqual({
                ...newUser,
                id: 10,
                password: undefined
            });
            expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'INSERT INTO user (name, email, password) VALUES (?, ?, ?)',
                ['Test User', 'test@test.com', 'hashedPassword123']
            );
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)',
                [10, Role.Admin, 0]
            );
        });

        test('should add user with franchisee role successfully', async () => {
            const newUser = {
                name: 'Franchise Owner',
                email: 'franchise@test.com',
                password: 'password',
                roles: [{ role: Role.Franchisee, object: 'PizzaPocket' }]
            };

            const mockUserInsert = { insertId: 11 };
            const mockFranchiseId = [{ id: 5 }];

            mockConnection.execute
                .mockResolvedValueOnce([mockUserInsert])
                .mockResolvedValueOnce([mockFranchiseId])
                .mockResolvedValueOnce([{}]);

            const result = await DB.addUser(newUser);

            expect(result).toEqual({
                ...newUser,
                id: 11,
                password: undefined
            });
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'SELECT id FROM franchise WHERE name=?',
                ['PizzaPocket']
            );
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)',
                [11, Role.Franchisee, 5]
            );
        });
    });

    describe('getUser', () => {
        test('should get user successfully with password verification', async () => {
            const mockUserRow = {
                id: 1,
                name: 'Test User',
                email: 'test@test.com',
                password: 'hashedPassword123'
            };
            const mockRoles = [
                { objectId: null, role: Role.Admin },
                { objectId: 5, role: Role.Franchisee }
            ];

            mockConnection.execute
                .mockResolvedValueOnce([[mockUserRow]])
                .mockResolvedValueOnce([mockRoles]);

            const result = await DB.getUser('test@test.com', 'password');

            expect(result).toEqual({
                id: 1,
                name: 'Test User',
                email: 'test@test.com',
                roles: [
                    { objectId: undefined, role: Role.Admin },
                    { objectId: 5, role: Role.Franchisee }
                ],
                password: undefined
            });
            expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashedPassword123');
        });

        test('should get user without password verification', async () => {
            const mockUserRow = {
                id: 1,
                name: 'Test User',
                email: 'test@test.com',
                password: 'hashedPassword123'
            };
            const mockRoles = [{ objectId: null, role: Role.Admin }];

            mockConnection.execute
                .mockResolvedValueOnce([[mockUserRow]])
                .mockResolvedValueOnce([mockRoles]);

            const result = await DB.getUser('test@test.com');

            expect(result.email).toBe('test@test.com');
            expect(bcrypt.compare).not.toHaveBeenCalled();
        });
        test('should throw error for wrong password', async () => {
            const mockUserRow = {
                id: 1,
                name: 'Test User',
                email: 'test@test.com',
                password: 'hashedPassword123'
            };

            mockConnection.execute.mockResolvedValueOnce([[mockUserRow]]);
            bcrypt.compare.mockResolvedValue(false);

            await expect(DB.getUser('test@test.com', 'wrongpassword'))
                .rejects.toThrow(StatusCodeError);
        });
    });

    describe('updateUser', () => {
        test('should update all user fields', async () => {
            const mockUpdatedUser = {
                id: 1,
                name: 'Updated Name',
                email: 'updated@test.com',
                roles: []
            };

            mockConnection.execute
                .mockResolvedValueOnce([{}])
                .mockResolvedValueOnce([[mockUpdatedUser]])
                .mockResolvedValueOnce([[]]);

            await DB.updateUser(1, 'Updated Name', 'updated@test.com', 'newpassword');
            expect(mockConnection.execute).toHaveBeenCalledTimes(3)
            expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
        });
        test('should not update when no parameters provided', async () => {
            const mockUser = { id: 1, name: 'Test', email: 'test@test.com', roles: [] };

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]])
                .mockResolvedValueOnce([[]]);

            await DB.updateUser(1, null, null, null);

            expect(mockConnection.execute).toHaveBeenCalledTimes(2);
        });
    });

    describe('loginUser', () => {
        test('should store login token', async () => {
            const token = 'header.payload.signature';
            mockConnection.execute.mockResolvedValue([{}]);

            await DB.loginUser(1, token);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                'INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token',
                ['signature', 1]
            );
        });

        test('should handle malformed token', async () => {
            const token = 'malformed-token';
            mockConnection.execute.mockResolvedValue([{}]);

            await DB.loginUser(1, token);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['', 1]
            );
        });
    });

    describe('isLoggedIn', () => {
        test('should return true for valid token', async () => {
            const token = 'header.payload.signature';
            mockConnection.execute.mockResolvedValue([[{ userId: 1 }]]);

            const result = await DB.isLoggedIn(token);

            expect(result).toBe(true);
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'SELECT userId FROM auth WHERE token=?',
                ['signature']
            );
        });

        test('should return false for invalid token', async () => {
            const token = 'header.payload.invalidsignature';
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await DB.isLoggedIn(token);

            expect(result).toBe(false);
        });
    });

    describe('logoutUser', () => {
        test('should remove auth token', async () => {
            const token = 'header.payload.signature';
            mockConnection.execute.mockResolvedValue([{}]);

            await DB.logoutUser(token);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                'DELETE FROM auth WHERE token=?',
                ['signature']
            );
        });
    });

    describe('getOrders', () => {
        test('should return user orders with items', async () => {
            const user = { id: 5 };
            const mockOrders = [
                { id: 1, franchiseId: 2, storeId: 3, date: '2024-06-05T05:14:40.000Z' },
                { id: 2, franchiseId: 2, storeId: 4, date: '2024-06-06T05:14:40.000Z' }
            ];
            const mockItems1 = [
                { id: 1, menuId: 1, description: 'Veggie', price: 0.05 }
            ];
            const mockItems2 = [
                { id: 2, menuId: 2, description: 'Pepperoni', price: 0.07 }
            ];

            mockConnection.execute
                .mockResolvedValueOnce([mockOrders])
                .mockResolvedValueOnce([mockItems1])
                .mockResolvedValueOnce([mockItems2]);

            const result = await DB.getOrders(user, 1);

            expect(result).toEqual({
                dinerId: 5,
                orders: [
                    { ...mockOrders[0], items: mockItems1 },
                    { ...mockOrders[1], items: mockItems2 }
                ],
                page: 1
            });
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT'),
                [5]
            );
        });

        test('should handle pagination correctly', async () => {
            const user = { id: 5 };
            mockConnection.execute.mockResolvedValue([[]]);

            await DB.getOrders(user, 3);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 20,10'),
                [5]
            );
        });
    });

    describe('addDinerOrder', () => {
        test('should rollback on database error', async () => {
            const user = { id: 5 };
            const order = {
                franchiseId: 2,
                storeId: 3,
                items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
            };

            mockConnection.beginTransaction.mockResolvedValue();
            mockConnection.execute
                .mockResolvedValueOnce([{ insertId: 10 }])
                .mockRejectedValueOnce(new Error('Menu item not found'));
            mockConnection.rollback.mockResolvedValue();
            await expect(DB.addDinerOrder(user, order)).rejects.toThrow('Menu item not found');
            expect(mockConnection.end).toHaveBeenCalled();
        });
    });

    describe('getUsers', () => {
        const adminUser = {
            isRole: (role) => role === Role.Admin
        };
        const nonAdminUser = {
            isRole: () => false
        };

        test('should throw unauthorized error if user is not admin', async () => {
            await expect(DB.getUsers(nonAdminUser))
                .rejects.toThrow(StatusCodeError);
        });
        test('should return users with roles', async () => {
            const mockUsers = [
                { id: 1, name: 'Alice', email: 'alice@test.com' },
                { id: 2, name: 'Bob', email: 'bob@test.com' }
            ];
            const mockRoles1 = [{ objectId: null, role: Role.Admin }];
            const mockRoles2 = [{ objectId: 5, role: Role.Franchisee }];

            mockConnection.execute.mockResolvedValueOnce([mockUsers]);

            mockConnection.execute
                .mockResolvedValueOnce([mockRoles1])
                .mockResolvedValueOnce([mockRoles2]);

            const result = await DB.getUsers(adminUser, 1, 2, '*');

            expect(result.page).toBe(1);
            expect(result.more).toBe(false);
            expect(result.users).toEqual([
                { ...mockUsers[0], roles: [{ objectId: undefined, role: Role.Admin }] },
                { ...mockUsers[1], roles: [{ objectId: 5, role: Role.Franchisee }] }
            ]);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE name LIKE ? LIMIT 3 OFFSET 0'),
                ['%']
            );
        });
    });
});
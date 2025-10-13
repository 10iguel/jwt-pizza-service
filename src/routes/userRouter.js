const express = require('express');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const { authRouter, setAuth } = require('./authRouter.js');

const userRouter = express.Router();

userRouter.docs = [
  {
    method: 'GET',
    path: '/api/user/me',
    requiresAuth: true,
    description: 'Get authenticated user',
    example: `curl -X GET localhost:3000/api/user/me -H 'Authorization: Bearer tttttt'`,
    response: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
  },
  {
    method: 'PUT',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Update user',
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
    {
        method: 'GET',
        path: '/api/user',
        requiresAuth: true,
        description: 'Gets a list of users (Admin only)',
        example: `curl -X GET "localhost:3000/api/user?page=1&limit=10&name=*" -H 'Content-Type: application/json'  'Authorization: Bearer tttttt'`,
        response: {
            users: [
                {
                    id: 1,
                    name: '常用名字',
                    email: 'a@jwt.com',
                    roles: [{ role: 'admin' }],
                },
            ],
            more: false,
        },
    },
    {
        method: 'DELETE',
        path: '/api/user/:userId',
        requiresAuth: true,
        description: 'Delete a user (self or Admin only)',
        example: `curl -X DELETE localhost:3000/api/user/1 -H 'Authorization: Bearer tttttt'`,
        response: null,
    },
];

// getUser
userRouter.get(
  '/me',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

userRouter.get(
    '/',
    authRouter.authenticateToken,
    asyncHandler(async (req, res) => {
        const user = req.user;
        if (!user.isRole(Role.Admin)) {
            return res.status(403).json({ message: 'unauthorized' });
        }

        const { page = 1, limit = 10, name = '*' } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const { users, more } = await DB.getUsers(user, pageNum, limitNum, name);

        res.json({ users, more });
    })
);


// updateUser
userRouter.put(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;
    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const updatedUser = await DB.updateUser(userId, name, email, password);
    const auth = await setAuth(updatedUser);
    res.json({ user: updatedUser, token: auth });
  })
);

userRouter.delete(
    '/:userId',
    authRouter.authenticateToken,
    asyncHandler(async (req, res) => {
        const userId = Number(req.params.userId);
        const user = req.user;
        if (user.id !== userId && !user.isRole(Role.Admin)) {
            return res.status(403).json({ message: 'unauthorized' });
        }

        await DB.deleteUser(userId);
        res.status(204).send();
    })
);

module.exports = userRouter;

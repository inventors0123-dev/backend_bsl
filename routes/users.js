const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get profile (protected)
router.get('/profile', auth, async (req, res) => {
    try {
        let user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'Profile not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update profile (protected)
router.put('/profile', auth, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        if (req.body.name) user.name = req.body.name;
        if (req.body.email && req.body.email !== user.email) {
            let emailExists = await User.findOne({ email: req.body.email });
            if (emailExists) {
                return res.status(400).json({ error: 'Email already in use' });
            }
            user.email = req.body.email;
        }
        if (req.body.preferences) {
            user.preferences = { ...user.preferences, ...req.body.preferences };
        }

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;

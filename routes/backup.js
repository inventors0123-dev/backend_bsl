const express = require('express');
const router = express.Router();
const DeviceParameter = require('../models/DeviceParameter');
const Device = require('../models/Device');
const Alert = require('../models/Alert');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

/**
 * Create a full database backup with date filtering
 * GET /api/backup/full
 * Query Parameters:
 *   - start_date: Start date for backup (optional)
 *   - end_date: End date for backup (optional)
 *   - collections: Comma-separated list of collections to backup (optional, defaults to all)
 */
router.get('/full', async (req, res) => {
    try {
        const { start_date, end_date, collections } = req.query;

        // Determine which collections to backup
        const collectionsToBackup = collections
            ? collections.split(',').map(c => c.trim())
            : ['devices', 'readings', 'alerts', 'users', 'settings'];

        const backupData = {
            metadata: {
                backup_date: new Date().toISOString(),
                start_date: start_date || 'all',
                end_date: end_date || 'all',
                collections: collectionsToBackup,
                version: '1.0'
            },
            data: {}
        };

        // Build date filter
        const dateFilter = {};
        if (start_date || end_date) {
            dateFilter.createdAt = {};
            if (start_date) dateFilter.createdAt.$gte = new Date(start_date);
            if (end_date) dateFilter.createdAt.$lte = new Date(end_date);
        }

        // Backup each collection
        if (collectionsToBackup.includes('devices')) {
            backupData.data.devices = await Device.find(dateFilter).lean();
            console.log(`✅ Backed up ${backupData.data.devices.length} devices`);
        }

        if (collectionsToBackup.includes('readings')) {
            const readingFilter = {};
            if (start_date || end_date) {
                readingFilter.reading_time = {};
                if (start_date) readingFilter.reading_time.$gte = new Date(start_date);
                if (end_date) readingFilter.reading_time.$lte = new Date(end_date);
            }
            backupData.data.readings = await DeviceParameter.find(readingFilter).lean();
            console.log(`✅ Backed up ${backupData.data.readings.length} readings`);
        }

        if (collectionsToBackup.includes('alerts')) {
            backupData.data.alerts = await Alert.find(dateFilter).lean();
            console.log(`✅ Backed up ${backupData.data.alerts.length} alerts`);
        }

        if (collectionsToBackup.includes('users')) {
            // Exclude passwords from backup for security
            backupData.data.users = await User.find(dateFilter).select('-password').lean();
            console.log(`✅ Backed up ${backupData.data.users.length} users`);
        }

        if (collectionsToBackup.includes('settings')) {
            backupData.data.settings = await SystemSettings.find().lean();
            console.log(`✅ Backed up ${backupData.data.settings.length} settings`);
        }

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `backup_${dateStr}.json`;

        // Send as downloadable JSON file
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(backupData);

    } catch (error) {
        console.error('❌ Backup error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create a compressed backup (ZIP format)
 * GET /api/backup/compressed
 */
router.get('/compressed', async (req, res) => {
    try {
        const { start_date, end_date, collections } = req.query;

        const collectionsToBackup = collections
            ? collections.split(',').map(c => c.trim())
            : ['devices', 'readings', 'alerts', 'users', 'settings'];

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `backup_${dateStr}.zip`;

        // Set response headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Create ZIP archive
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        // Add metadata
        const metadata = {
            backup_date: new Date().toISOString(),
            start_date: start_date || 'all',
            end_date: end_date || 'all',
            collections: collectionsToBackup,
            version: '1.0'
        };
        archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

        // Build date filter
        const dateFilter = {};
        if (start_date || end_date) {
            dateFilter.createdAt = {};
            if (start_date) dateFilter.createdAt.$gte = new Date(start_date);
            if (end_date) dateFilter.createdAt.$lte = new Date(end_date);
        }

        // Backup each collection as separate file
        if (collectionsToBackup.includes('devices')) {
            const devices = await Device.find(dateFilter).lean();
            archive.append(JSON.stringify(devices, null, 2), { name: 'devices.json' });
            console.log(`✅ Added ${devices.length} devices to backup`);
        }

        if (collectionsToBackup.includes('readings')) {
            const readingFilter = {};
            if (start_date || end_date) {
                readingFilter.reading_time = {};
                if (start_date) readingFilter.reading_time.$gte = new Date(start_date);
                if (end_date) readingFilter.reading_time.$lte = new Date(end_date);
            }
            const readings = await DeviceParameter.find(readingFilter).lean();
            archive.append(JSON.stringify(readings, null, 2), { name: 'readings.json' });
            console.log(`✅ Added ${readings.length} readings to backup`);
        }

        if (collectionsToBackup.includes('alerts')) {
            const alerts = await Alert.find(dateFilter).lean();
            archive.append(JSON.stringify(alerts, null, 2), { name: 'alerts.json' });
            console.log(`✅ Added ${alerts.length} alerts to backup`);
        }

        if (collectionsToBackup.includes('users')) {
            const users = await User.find(dateFilter).select('-password').lean();
            archive.append(JSON.stringify(users, null, 2), { name: 'users.json' });
            console.log(`✅ Added ${users.length} users to backup`);
        }

        if (collectionsToBackup.includes('settings')) {
            const settings = await SystemSettings.find().lean();
            archive.append(JSON.stringify(settings, null, 2), { name: 'settings.json' });
            console.log(`✅ Added ${settings.length} settings to backup`);
        }

        // Finalize the archive
        await archive.finalize();

    } catch (error) {
        console.error('❌ Compressed backup error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get backup statistics
 * GET /api/backup/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const dateFilter = {};
        if (start_date || end_date) {
            dateFilter.createdAt = {};
            if (start_date) dateFilter.createdAt.$gte = new Date(start_date);
            if (end_date) dateFilter.createdAt.$lte = new Date(end_date);
        }

        const readingFilter = {};
        if (start_date || end_date) {
            readingFilter.reading_time = {};
            if (start_date) readingFilter.reading_time.$gte = new Date(start_date);
            if (end_date) readingFilter.reading_time.$lte = new Date(end_date);
        }

        const stats = {
            devices: await Device.countDocuments(dateFilter),
            readings: await DeviceParameter.countDocuments(readingFilter),
            alerts: await Alert.countDocuments(dateFilter),
            users: await User.countDocuments(dateFilter),
            settings: await SystemSettings.countDocuments(),
            total_records: 0
        };

        stats.total_records = stats.devices + stats.readings + stats.alerts + stats.users + stats.settings;

        // Estimate backup size (rough calculation)
        const avgRecordSize = 500; // bytes
        const estimatedSize = stats.total_records * avgRecordSize;
        stats.estimated_size_mb = (estimatedSize / (1024 * 1024)).toFixed(2);

        res.json(stats);

    } catch (error) {
        console.error('❌ Backup stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Backup by date range (specific date-wise backup)
 * GET /api/backup/by-date
 */
router.get('/by-date', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }

        // Set date range for single day
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const backupData = {
            metadata: {
                backup_date: new Date().toISOString(),
                target_date: date,
                version: '1.0'
            },
            data: {}
        };

        // Backup data for specific date
        backupData.data.readings = await DeviceParameter.find({
            reading_time: { $gte: startOfDay, $lte: endOfDay }
        }).lean();

        backupData.data.alerts = await Alert.find({
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        }).lean();

        backupData.data.devices = await Device.find().lean();

        const filename = `backup_${date}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(backupData);

    } catch (error) {
        console.error('❌ Date backup error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

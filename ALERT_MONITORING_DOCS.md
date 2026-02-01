# Real-time Alert Monitoring System

## Overview
A comprehensive, intelligent alert monitoring system that continuously monitors electrical parameters and generates alerts based on configurable thresholds with time delays and hysteresis.

## Alert Types Implemented

### 1. Phase Over Current Alert
**Logic**: If phase current > Rated_Current × Threshold AND condition persists for defined time → Alert

**Thresholds**:
- **Warning**: >85% of rated current for 60 seconds
- **Critical**: >100% of rated current for 10 seconds

**Message Example**:
```
"R phase current high: 20A (limit 17A)"
```

### 2. Current Imbalance Alert
**Calculation**:
```javascript
I_avg = (Ir + Iy + Ib) / 3
Max_Diff = max(|Ir − I_avg|, |Iy − I_avg|, |Ib − I_avg|)
Imbalance% = (Max_Diff / I_avg) × 100
```

**Thresholds**:
- **Warning**: >10% for 120 seconds
- **Critical**: >20% for 60 seconds

### 3. Voltage Alerts

**Low/High Voltage**:
- **Warning**: <210V or >250V for 30 seconds
- **Critical**: <190V or >260V for 10 seconds

**Voltage Imbalance**:
- **Warning**: >2%
- **Critical**: >3%

### 4. Phase Loss Alert
**Logic**: If V_phase < 50V for 5 seconds → Phase Missing Alert

### 5. Low Power Factor
**Calculation**: PF = kW_total / kVA_total

**Thresholds**:
- **Warning**: PF < 0.85 for 10 minutes
- **Critical**: PF < 0.75 for 5 minutes

### 6. Frequency Alert
**Thresholds**:
- **Warning**: <49.5 or >50.5 Hz for 30 seconds
- **Critical**: <49 or >51 Hz for 10 seconds

### 7. Temperature Alert (if sensor available)
**Thresholds**:
- **Warning**: >55°C for 5 minutes
- **Critical**: >65°C for 2 minutes

### 8. Device Health Alerts

**No Data**:
- **Warning**: No data for 5 minutes
- **Critical**: No data for 30 minutes

**Sensor Error**: Detected if current = 0 but kW > 0

## Alert Engine Features

### Time Delay
- Prevents false alarms by requiring conditions to persist for configurable duration
- Different delays for warning vs critical severity

### Hysteresis
- Clears alert states automatically when conditions return to normal
- Prevents alert flapping

### Rate Limiting
- Maximum one notification per alert per 15 minutes
- Prevents alert spam

### Severity Levels
1. **INFO**: Informational messages
2. **WARNING**: Requires attention but not urgent
3. **CRITICAL**: Immediate action required

### Alert State Tracking
- Tracks when each alert condition first became true
- Maintains duration counters
- Implements notification throttling

## Monitoring Schedule
- **Frequency**: Every 30 seconds
- **Auto-start**: Enabled on server startup
- **Coverage**: ALL devices monitored simultaneously

## Database Schema
Alerts are stored with:
- Device ID
- Alert type
- Severity
- Message
- Current value
- Threshold
- Reading snapshot (ID reference)
- Resolved status
- Timestamps

## Integration

### Backend Files Created:
1. `/backend/services/alertMonitor.js` - Core monitoring logic
2. `/backend/services/alertScheduler.js` - Cron scheduler
3. Updated `/backend/server.js` - Auto-start on boot

### API Endpoints:
- `GET /api/alerts` - Fetch all alerts (filtered by severity, device, etc.)
- `PUT /api/alerts/:id/resolve` - Mark alert as resolved
- `DELETE /api/alerts/:id` - Delete alert

### Frontend Integration:
- Alerts displayed in `AlertsWidget` component
- Real-time updates via polling (5-second refresh)
- Color-coded by severity
- Clickable to view details

## Configuration

### System Settings (Configurable via UI):
- `current_max`: Rated current (default: 20A)
- Alert thresholds can be customized per deployment

### Environment Variables:
- No additional environment variables required
- Uses existing MongoDB connection

## Usage

### Starting the Monitor:
```bash
# Automatically starts with backend server
npm run dev
```

### Viewing Logs:
The monitor logs to console:
```
🔍 Running alert monitor...
✅ Alert created: R phase current high: 20A (limit 17A)
✅ Alert monitor completed
```

### Alert Notification Flow:
1. Device sends reading every 10-30 seconds
2. Alert monitor checks against thresholds every 30 seconds
3. If condition met → Start timer
4. If condition persists for required duration → Create alert
5. Rate limit: Max 1 notification per 15 min for same alert
6. Auto-clear when condition resolves (hysteresis)

## Benefits

✅ **Prevents Equipment Damage**: Early warning for overloads  
✅ **Reduces Downtime**: Phase loss and voltage alerts  
✅ **Improves Power Quality**: PF and voltage imbalance alerts  
✅ **Predictive Maintenance**: Temperature and health monitoring  
✅ **False Alarm Prevention**: Time delays and hysteresis  
✅ **Scalable**: Monitors unlimited devices simultaneously  
✅ **Non-intrusive**: Runs in background, minimal performance impact  

## Future Enhancements (Optional)

1. Email/SMS notifications
2. Webhook integration for external systems
3. Machine learning for predictive alerts
4. Custom alert rules via UI
5. Alert dashboard with analytics
6. Export alert history to CSV/PDF

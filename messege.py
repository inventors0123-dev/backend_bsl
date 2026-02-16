import argparse
import json
import os
import re
import time
from datetime import date, datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import requests
except ImportError:
    requests = None

# ================= CONFIGURATION =================

# 1. IoT Data Source
DATA_URL = os.getenv("IOT_DATA_URL", "INSERT_YOUR_IOT_URL_HERE")

# 2. Database Credentials (Hostinger Remote MySQL)
DB_HOST = os.getenv("MYSQL_HOST", "YOUR_HOSTINGER_SERVER_IP")
DB_USER = os.getenv("MYSQL_USER", "u123456789_user")
DB_PASS = os.getenv("MYSQL_PASSWORD", "your_db_password")
DB_NAME = os.getenv("MYSQL_DATABASE", "u123456789_name")
TABLE_NAME = os.getenv("MYSQL_TABLE_NAME", "sensor_data")
TABLE_TIMESTAMP_COLUMN = os.getenv("MYSQL_TIMESTAMP_COLUMN", "timestamp_column")

# 3. WhatsApp API Credentials
TOKEN = os.getenv("WHATSAPP_TOKEN", "")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
MY_NUMBER = os.getenv("WHATSAPP_TO_NUMBER", "")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v17.0")
DEFAULT_ALERT_TEMPLATE = os.getenv("WHATSAPP_ALERT_TEMPLATE", "factory_alert")
WHATSAPP_TEMPLATE_LANG = os.getenv("WHATSAPP_TEMPLATE_LANG", "en_US")
WHATSAPP_DEBUG = os.getenv("WHATSAPP_DEBUG", "false").strip().lower() in ("1", "true", "yes", "on")

# 4. Factory Logic Settings
THRESHOLD_CURRENT = float(os.getenv("FACTORY_THRESHOLD_CURRENT", "15.0"))
DAY_START_TIME = os.getenv("DAY_START_TIME", "09:00")
DAY_END_TIME = os.getenv("DAY_END_TIME", "21:00")
COST_PER_UNIT = float(os.getenv("COST_PER_UNIT", "7.50"))
factory_was_running = False


# ================= HTTP HELPERS =================

def _http_post_json(url, payload, headers, timeout=15):
    if requests is not None:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
        return response.status_code, response.text

    request = Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def _http_get_json(url, timeout=10):
    if requests is not None:
        response = requests.get(url, timeout=timeout)
        return response.status_code, response.json() if response.status_code == 200 else None

    request = Request(url=url, method="GET")
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            return response.status, None
        data = json.loads(response.read().decode("utf-8"))
        return response.status, data


# ================= FUNCTIONS =================

def _is_digits_only(value):
    return bool(value) and value.isdigit()


def _sanitize_template_text(value):
    # WhatsApp template params cannot contain new lines/tabs or long space runs.
    text = str(value)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def validate_whatsapp_config():
    errors = []
    warnings = []

    if not TOKEN:
        errors.append("WHATSAPP_TOKEN is missing.")
    if not PHONE_ID:
        errors.append("WHATSAPP_PHONE_ID is missing.")
    if not MY_NUMBER:
        errors.append("WHATSAPP_TO_NUMBER is missing.")
    if not DEFAULT_ALERT_TEMPLATE:
        errors.append("WHATSAPP_ALERT_TEMPLATE is missing.")

    if PHONE_ID and not _is_digits_only(PHONE_ID):
        errors.append("WHATSAPP_PHONE_ID must be numeric Phone Number ID (no +, no spaces).")
    if MY_NUMBER and not _is_digits_only(MY_NUMBER):
        errors.append("WHATSAPP_TO_NUMBER must be digits only (example: 919876543210).")

    if WHATSAPP_API_VERSION and not WHATSAPP_API_VERSION.startswith("v"):
        warnings.append("WHATSAPP_API_VERSION should look like v17.0 or v21.0.")

    return errors, warnings

def get_db_connection():
    try:
        import mysql.connector
    except ImportError as error:
        raise RuntimeError("Missing mysql-connector-python package.") from error

    return mysql.connector.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME
    )


def send_whatsapp(template_name, variables):
    """Sends a template-based message via WhatsApp Cloud API."""
    if not TOKEN or not PHONE_ID or not MY_NUMBER:
        print("WhatsApp config missing. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TO_NUMBER.")
        return False

    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
    def build_payload(include_params):
        template = {
            "name": template_name,
            "language": {"code": WHATSAPP_TEMPLATE_LANG}
        }

        if include_params:
            template["components"] = [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": _sanitize_template_text(var)}
                    for var in variables
                ]
            }]

        return {
            "messaging_product": "whatsapp",
            "to": MY_NUMBER,
            "type": "template",
            "template": template
        }

    try:
        if WHATSAPP_DEBUG:
            print(f"DEBUG WhatsApp URL: {url}")
            print(f"DEBUG Template: {template_name}")
            print(f"DEBUG To: {MY_NUMBER}")

        payload = build_payload(include_params=True)
        status_code, response_text = _http_post_json(url, payload, headers)
        if 200 <= status_code < 300:
            print(f"WhatsApp template '{template_name}' sent successfully.")
            return True

        # Auto-fix: if template expects 0 params, retry without body params.
        error_code = None
        details = ""
        try:
            parsed = json.loads(response_text)
            err = parsed.get("error", {})
            error_code = err.get("code")
            details = str(err.get("error_data", {}).get("details", ""))
        except Exception:
            pass

        if error_code == 132000 and "expected number of params (0)" in details:
            print("Template expects 0 params. Retrying without template variables...")
            payload_no_params = build_payload(include_params=False)
            status_code, response_text = _http_post_json(url, payload_no_params, headers)
            if 200 <= status_code < 300:
                print(f"WhatsApp template '{template_name}' sent successfully (no params).")
                return True

        print(f"WhatsApp error {status_code}: {response_text}")
        return False
    except (HTTPError, URLError, OSError) as error:
        print(f"Connection error while sending WhatsApp message: {error}")
        return False
    except Exception as error:
        print(f"Unexpected WhatsApp send error: {error}")
        return False


def get_iot_data():
    """Fetches the latest reading from your IoT URL."""
    if not DATA_URL or "INSERT_YOUR_IOT_URL_HERE" in DATA_URL:
        return None

    try:
        status_code, data = _http_get_json(DATA_URL, timeout=10)
        if status_code != 200 or not isinstance(data, dict):
            return None

        # Adjust these keys based on your actual IoT JSON output
        r = float(data.get("R", 0))
        y = float(data.get("Y", 0))
        b = float(data.get("B", 0))
        energy = float(data.get("energy_value", 0))
        return {"R": r, "Y": y, "B": b, "energy": energy}
    except Exception as error:
        print(f"IoT URL error: {error}")
        return None


# ================= JOB LOGIC =================

def check_factory_spike():
    """Monitors for sudden current rise to alert the owner."""
    global factory_was_running
    data = get_iot_data()
    if not data:
        return

    # Check if any phase exceeds threshold
    if data["R"] > THRESHOLD_CURRENT or data["Y"] > THRESHOLD_CURRENT or data["B"] > THRESHOLD_CURRENT:
        if not factory_was_running:
            alert_text = f"Factory started. R: {data['R']}A, Y: {data['Y']}A, B: {data['B']}A"
            send_whatsapp(DEFAULT_ALERT_TEMPLATE, [alert_text])
            factory_was_running = True
    else:
        factory_was_running = False


def job_day_start():
    print(f"\n--- Day Start Job: {datetime.now()} ---")
    data = get_iot_data()
    if data:
        send_whatsapp("day_start_alert", [data["energy"], "Online"])
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(f"INSERT INTO {TABLE_NAME} (energy_value) VALUES (%s)", (data["energy"],))
            conn.commit()
            conn.close()
        except Exception as error:
            print(f"DB log error: {error}")


def job_day_end():
    print(f"\n--- Day End Job: {datetime.now()} ---")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = (
            f"SELECT MAX(energy_value) - MIN(energy_value) FROM {TABLE_NAME} "
            f"WHERE DATE({TABLE_TIMESTAMP_COLUMN}) = CURDATE()"
        )
        cursor.execute(query)
        result = cursor.fetchone()
        if result and result[0] is not None:
            consumption = round(result[0], 2)
            cost = round(consumption * COST_PER_UNIT, 2)
            send_whatsapp("day_end_report", [str(date.today()), consumption, cost])
        conn.close()
    except Exception as error:
        print(f"DB report error: {error}")


def send_dashboard_alert_once(alert_text, template_name=None):
    chosen_template = template_name or DEFAULT_ALERT_TEMPLATE
    return send_whatsapp(chosen_template, [alert_text])


def run_config_validation():
    errors, warnings = validate_whatsapp_config()

    print("WhatsApp config validation:")
    if not errors and not warnings:
        print("OK: configuration looks valid.")
        return 0

    for item in warnings:
        print(f"WARNING: {item}")
    for item in errors:
        print(f"ERROR: {item}")

    return 1 if errors else 0


# ================= RUNTIME MODES =================

def run_scheduler():
    try:
        import schedule
    except ImportError:
        print("Missing schedule package. Install with: pip install schedule")
        return 1

    print("IoT Monitoring System Started...")

    # 1. Check for factory spike every 2 minutes
    schedule.every(2).minutes.do(check_factory_spike)

    # 2. Daily scheduled reports
    schedule.every().day.at(DAY_START_TIME).do(job_day_start)
    schedule.every().day.at(DAY_END_TIME).do(job_day_end)

    while True:
        schedule.run_pending()
        time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="IoT WhatsApp notifier bridge")
    parser.add_argument(
        "--mode",
        choices=["scheduler", "dashboard-alert", "validate-config"],
        default="scheduler",
        help="Use 'dashboard-alert' for one-time sends from Node backend."
    )
    parser.add_argument("--alert-text", help="Alert text for dashboard-alert mode.")
    parser.add_argument("--template", help="WhatsApp template override.")
    args = parser.parse_args()

    if args.mode == "dashboard-alert":
        if not args.alert_text:
            print("Missing --alert-text for dashboard-alert mode.")
            return 1
        return 0 if send_dashboard_alert_once(args.alert_text, args.template) else 1

    if args.mode == "validate-config":
        return run_config_validation()

    return run_scheduler()


if __name__ == "__main__":
    raise SystemExit(main())

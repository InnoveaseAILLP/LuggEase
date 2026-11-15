"""Safe import defaults. Local test runs never inherit production credentials."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {
    'MONGO_URL':'mongodb://127.0.0.1:27017', 'DB_NAME':'luggease_unit_test',
    'APP_ENV':'test', 'APP_VERSION':'test', 'JWT_SECRET':'test-secret-with-at-least-32-characters',
    'ADMIN_EMAIL':'admin@example.com', 'ADMIN_PASSWORD':'local-test-password',
    'ALLOW_LEGACY_AUTH':'false', 'FIREBASE_PROJECT_ID':'demo-luggease',
    'SUPPLIER_NAME':'Test supplier', 'SUPPLIER_GSTIN':'29ABCDE1234F1Z5',
    'SUPPLIER_STATE':'Karnataka', 'SUPPLIER_ADDRESS':'Test address', 'SUPPLIER_PAN':'ABCDE1234F',
    'SUPPLIER_BANK_NAME':'Test bank', 'SUPPLIER_BANK_ACCOUNT':'123456789012',
    'SUPPLIER_BANK_IFSC':'TEST0000001', 'SUPPLIER_BANK_BRANCH':'Test',
}.items():
    os.environ[key] = value

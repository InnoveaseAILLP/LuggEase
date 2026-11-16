FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py firebase_identity.py seed_demo.py google_places.py invoice_pdf.py logistics.py logistics_workflow.py shipment_documents.py instalments.py rate_limit.py ./
COPY assets ./assets
RUN useradd --create-home appuser
USER appuser
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT}"]

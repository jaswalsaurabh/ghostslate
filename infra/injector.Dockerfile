FROM python:3.13-slim

WORKDIR /app/tools/generator

COPY tools/generator/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY tools/generator ./
COPY sql/schema/002_incident_ledger.sql /app/sql/schema/002_incident_ledger.sql

CMD ["python", "inject.py"]

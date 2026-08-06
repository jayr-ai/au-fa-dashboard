from google.cloud import bigquery

client = bigquery.Client(project='jv-data-warehouse')

# Count total rows in BigQuery
query = """
SELECT 
  COUNT(*) as total_rows,
  COUNT(DISTINCT transaction_id) as unique_transactions
FROM `jv-data-warehouse.freedom_academy_au.revenue_transactions`
"""

result = client.query(query).result()
for row in result:
    print(f"Total rows in BigQuery: {row['total_rows']}")
    print(f"Unique transaction IDs: {row['unique_transactions']}")
    print(f"Duplicates: {row['total_rows'] - row['unique_transactions']}")

import psycopg2
import os


def get_connection():
    return psycopg2.connect(
        dbname=os.getenv("POSTGRES_DB", "pokerdb"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port="5432",
    )

import sqlite3

from app import DATABASE_PATH


def migrate_database():
    with sqlite3.connect(DATABASE_PATH) as connection:
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(documents)"
            ).fetchall()
        }

        if "source_filename" not in columns:
            connection.execute(
                "ALTER TABLE documents ADD COLUMN source_filename TEXT"
            )

        if "file_path" not in columns:
            connection.execute(
                "ALTER TABLE documents ADD COLUMN file_path TEXT"
            )

    print("Database migration completed successfully.")


if __name__ == "__main__":
    migrate_database()

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DB_CONNECTION_STRING: str
    DB_NAME: str
    JWT_SECRET: str 
    ALGORITHM: str 
    ACCESS_TOKEN_DURATION_MINUTE: int 
    REFRESH_TOKEN_DURATION_DAY: int 
    BASE_URL: str
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:5173"
    ENCRYPTION_KEY: str = ""
    FRONTEND_URL: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    MAIL_SYNC_INTERVAL_MINUTES: int = 10
    MAIL_SYNC_LOOKBACK_DAYS: int = 90
    MAIL_SYNC_MAX_PAGES: int = 5
    # DB-first architecture settings
    MAIL_SYNC_INTERVAL_SECONDS: int = 300  # 5 minutes default
    MAIL_SYNC_STARTUP_FULL: bool = True
    MAIL_SYNC_CONCURRENCY_LIMIT: int = 1
    MAIL_SYNC_MAX_EMAILS_PER_BATCH: int = 1000  # Maximum emails to sync per batch
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION: str = "emails"
    EMBEDDING_BATCH_SIZE: int = 50
    EMBEDDING_JOB_INTERVAL_MINUTES: int = 5

    model_config = SettingsConfigDict(env_file=".env.local")

settings = Settings()


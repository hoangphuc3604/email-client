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

    model_config = SettingsConfigDict(env_file=".env.local")

settings = Settings()


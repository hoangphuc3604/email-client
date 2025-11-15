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
    FRONTEND_URL: str = ""

    model_config = SettingsConfigDict(env_file=".env.local")


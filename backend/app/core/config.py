from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str
    app_env: str
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    google_client_id: str = ""
    admin_emails: str = "fidelisnguakaaga20@gmail.com"

    class Config:
        env_file = ".env"

    @property
    def admin_email_list(self) -> list[str]:
        return [email.strip().lower() for email in self.admin_emails.split(",") if email.strip()]


settings = Settings()

from pymongo.database import Database

class MailService:
  def __init__(self, db: Database):
    self.db = db
    self.emails_collection = db["emails"]

  # def get_mailboxes(self, user_id: str):
  #   """Retrieve mailboxes for a user."""
  #   mailboxes = self.db["mailboxes"].find({"user_id": user_id})
  #   return list(mailboxes)
    
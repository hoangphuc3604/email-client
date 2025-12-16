"""
Quick script to check if email index has data and test search functionality
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

MONGODB_URI = os.getenv('MONGODB_URI')
MONGODB_DB_NAME = os.getenv('MONGODB_DB_NAME', 'email_client')


async def check_email_index():
    """Check the email_index collection for data"""
    print("=" * 60)
    print("EMAIL INDEX DIAGNOSTIC")
    print("=" * 60)
    print(f"\nConnecting to: {MONGODB_URI}")
    print(f"Database: {MONGODB_DB_NAME}")
    
    # Connect to database
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB_NAME]
    email_index = db["email_index"]
    users = db["users"]
    
    # Count total documents
    total_emails = await email_index.count_documents({})
    print(f"\n📊 Total emails in index: {total_emails}")
    
    # Count users
    total_users = await users.count_documents({})
    print(f"👥 Total users: {total_users}")
    
    # Get user breakdown
    print("\n📧 Emails per user:")
    async for user in users.find({}):
        user_id = str(user["_id"])
        email_count = await email_index.count_documents({"user_id": user_id})
        user_email = user.get("email", "Unknown")
        print(f"  - {user_email} ({user_id}): {email_count} emails")
        
        # Show sample email subjects for this user
        if email_count > 0:
            print(f"    Sample subjects:")
            async for email in email_index.find({"user_id": user_id}).limit(5):
                subject = email.get("subject", "(No subject)")[:50]
                print(f"      • {subject}")
    
    # Sample search test
    print("\n🔍 Testing sample searches:")
    test_queries = ["the", "test", "email", "hello"]
    
    if total_users > 0:
        # Get first user
        first_user = await users.find_one({})
        user_id = str(first_user["_id"])
        
        for query in test_queries:
            regex = {"$regex": query, "$options": "i"}
            search_query = {
                "$or": [
                    {"subject": regex},
                    {"from_name": regex},
                    {"from_email": regex},
                    {"snippet": regex}
                ],
                "user_id": user_id
            }
            count = await email_index.count_documents(search_query)
            print(f"  '{query}': {count} results")
    
    print("\n" + "=" * 60)
    
    # Close connection
    client.close()


if __name__ == "__main__":
    asyncio.run(check_email_index())

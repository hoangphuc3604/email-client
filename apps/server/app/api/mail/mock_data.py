"""Mock email data for dashboard testing.

This mock data structure follows Zero email client's data model:
- Threads contain multiple messages
- Uses thread-based structure similar to Gmail/Zero
- Supports pagination, filtering, and search
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import copy

# Mock mailboxes/folders (same as Zero's folder structure)
MOCK_MAILBOXES: List[Dict[str, Any]] = [
    {
        "id": "inbox",
        "name": "Inbox",
        "icon": "inbox",
        "unread_count": 12,
        "total_count": 156
    },
    {
        "id": "starred",
        "name": "Starred",
        "icon": "star",
        "unread_count": 3,
        "total_count": 24
    },
    {
        "id": "sent",
        "name": "Sent",
        "icon": "send",
        "unread_count": 0,
        "total_count": 89
    },
    {
        "id": "drafts",
        "name": "Drafts",
        "icon": "draft",
        "unread_count": 2,
        "total_count": 8
    },
    {
        "id": "archive",
        "name": "Archive",
        "icon": "archive",
        "unread_count": 0,
        "total_count": 342
    },
    {
        "id": "trash",
        "name": "Trash",
        "icon": "delete",
        "unread_count": 0,
        "total_count": 15
    },
    {
        "id": "spam",
        "name": "Spam",
        "icon": "report",
        "unread_count": 5,
        "total_count": 23
    },
    {
        "id": "work",
        "name": "Work",
        "icon": "work",
        "unread_count": 4,
        "total_count": 67,
        "custom": True
    },
    {
        "id": "personal",
        "name": "Personal",
        "icon": "person",
        "unread_count": 1,
        "total_count": 45,
        "custom": True
    },
    {
        "id": "todo",
        "name": "To Do",
        "icon": "task", # Icon identifier
        "unread_count": 1,
        "total_count": 5,
        "custom": True
    },
    {
        "id": "done",
        "name": "Done",
        "icon": "check",
        "unread_count": 0,
        "total_count": 10,
        "custom": True
    }
]


def _generate_timestamp(days_ago: int = 0, hours_ago: int = 0, minutes_ago: int = 0) -> str:
    """Generate ISO timestamp relative to now."""
    dt = datetime.now() - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)
    return dt.isoformat() + "Z"


# Mock threads with messages (following Zero's IGetThreadResponse structure)
# Thread ID -> Thread data with messages
MOCK_THREADS: Dict[str, Dict[str, Any]] = {
    "thread_001": {
        "id": "thread_001",
        "history_id": "12345",
        "labels": [{"id": "inbox", "name": "inbox"}, {"id": "work", "name": "work"}],
        "messages": [
            {
                "id": "msg_001_1",
                "thread_id": "thread_001",
                "connection_id": "conn_001",
                "title": "Q4 Marketing Campaign Review - Action Required",
                "subject": "Q4 Marketing Campaign Review - Action Required",
                "sender": {
                    "name": "Sarah Johnson",
                    "email": "sarah.johnson@techcorp.com"
                },
                "to": [
                    {"name": "Me", "email": "me@example.com"}
                ],
                "cc": None,
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(hours_ago=2),
                "unread": True,
                "body": "Hi team,\n\nI've attached the Q4 marketing campaign analysis...",
                "processed_html": """<div><p>Hi team,</p><p>I've attached the Q4 marketing campaign analysis. Please review the key metrics and provide your feedback by EOD Friday.</p><p><strong>Key Highlights:</strong></p><ul><li>ROI increased by 23% compared to Q3</li><li>Customer acquisition cost down by 15%</li><li>Email open rates improved to 32%</li></ul><p>Let me know if you have any questions.</p><p>Best regards,<br>Sarah</p></div>""",
                "blob_url": "",
                "decoded_body": """<div><p>Hi team,</p><p>I've attached the Q4 marketing campaign analysis. Please review the key metrics and provide your feedback by EOD Friday.</p><p><strong>Key Highlights:</strong></p><ul><li>ROI increased by 23% compared to Q3</li><li>Customer acquisition cost down by 15%</li><li>Email open rates improved to 32%</li></ul><p>Let me know if you have any questions.</p><p>Best regards,<br>Sarah</p></div>""",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}, {"id": "work", "name": "work", "type": "user"}],
                "attachments": [
                    {
                        "attachment_id": "att_001",
                        "filename": "Q4_Campaign_Report.pdf",
                        "mime_type": "application/pdf",
                        "size": 2458124,
                        "body": "",
                        "headers": []
                    }
                ],
                "is_draft": False,
                "message_id": "msg_001_1@example.com",
                "references": None,
                "in_reply_to": None,
                "reply_to": None
            }
        ]
    },
    "thread_002": {
        "id": "thread_002",
        "history_id": "12346",
        "labels": [{"id": "inbox", "name": "inbox"}],
        "messages": [
            {
                "id": "msg_002_1",
                "thread_id": "thread_002",
                "connection_id": "conn_001",
                "title": "You have 5 new connection requests",
                "subject": "You have 5 new connection requests",
                "sender": {
                    "name": "LinkedIn",
                    "email": "noreply@linkedin.com"
                },
                "to": [{"name": "Me", "email": "me@example.com"}],
                "cc": None,
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(hours_ago=5),
                "unread": True,
                "body": "You have 5 new connection requests waiting for you...",
                "processed_html": """<div style="font-family: Arial, sans-serif;"><h2>New Connection Requests</h2><p>You have 5 new connection requests waiting for you:</p><ul><li>John Smith - Software Engineer at Google</li><li>Emily Chen - Product Manager at Meta</li><li>Michael Brown - CTO at StartupXYZ</li><li>Lisa Wang - Senior Developer at Amazon</li><li>David Martinez - Tech Lead at Microsoft</li></ul><p><a href="https://linkedin.com/connections">View all requests</a></p></div>""",
                "blob_url": "",
                "decoded_body": """<div style="font-family: Arial, sans-serif;"><h2>New Connection Requests</h2><p>You have 5 new connection requests waiting for you:</p><ul><li>John Smith - Software Engineer at Google</li><li>Emily Chen - Product Manager at Meta</li><li>Michael Brown - CTO at StartupXYZ</li><li>Lisa Wang - Senior Developer at Amazon</li><li>David Martinez - Tech Lead at Microsoft</li></ul><p><a href="https://linkedin.com/connections">View all requests</a></p></div>""",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}],
                "attachments": None,
                "is_draft": False,
                "message_id": "msg_002_1@example.com",
                "references": None,
                "in_reply_to": None,
                "reply_to": None
            }
        ]
    },
    "thread_003": {
        "id": "thread_003",
        "history_id": "12347",
        "labels": [{"id": "inbox", "name": "inbox"}, {"id": "work", "name": "work"}],
        "messages": [
            {
                "id": "msg_003_1",
                "thread_id": "thread_003",
                "connection_id": "conn_001",
                "title": "Website Redesign Mockups - Round 1",
                "subject": "Website Redesign Mockups - Round 1",
                "sender": {
                    "name": "Me",
                    "email": "me@example.com"
                },
                "to": [{"name": "Alex Rivera", "email": "alex.rivera@designstudio.com"}],
                "cc": [{"name": "Design Team", "email": "design@example.com"}],
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(days_ago=1, hours_ago=3),
                "unread": False,
                "body": "Hey Alex, could you review these initial mockups?",
                "processed_html": "<div><p>Hey Alex,</p><p>Could you review these initial mockups? Looking for feedback on the overall layout and color scheme.</p><p>Thanks!</p></div>",
                "blob_url": "",
                "decoded_body": "<div><p>Hey Alex,</p><p>Could you review these initial mockups? Looking for feedback on the overall layout and color scheme.</p><p>Thanks!</p></div>",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}, {"id": "work", "name": "work", "type": "user"}],
                "attachments": None,
                "is_draft": False,
                "message_id": "msg_003_1@example.com",
                "references": None,
                "in_reply_to": None,
                "reply_to": None
            },
            {
                "id": "msg_003_2",
                "thread_id": "thread_003",
                "connection_id": "conn_001",
                "title": "Re: Website Redesign Mockups - Round 2",
                "subject": "Re: Website Redesign Mockups - Round 2",
                "sender": {
                    "name": "Alex Rivera",
                    "email": "alex.rivera@designstudio.com"
                },
                "to": [{"name": "Me", "email": "me@example.com"}],
                "cc": [{"name": "Design Team", "email": "design@example.com"}],
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(hours_ago=8),
                "unread": False,
                "body": "Thanks for the feedback! I've updated the homepage mockups...",
                "processed_html": """<div><p>Hi,</p><p>Thanks for the feedback! I've updated the homepage mockups based on your comments.</p><p>The new version includes:</p><ol><li>Larger hero section with updated CTA</li><li>Simplified navigation menu</li><li>New testimonial section</li><li>Mobile-responsive improvements</li></ol><p>Check out the Figma link and let me know what you think!</p><p>Alex</p></div>""",
                "blob_url": "",
                "decoded_body": """<div><p>Hi,</p><p>Thanks for the feedback! I've updated the homepage mockups based on your comments.</p><p>The new version includes:</p><ol><li>Larger hero section with updated CTA</li><li>Simplified navigation menu</li><li>New testimonial section</li><li>Mobile-responsive improvements</li></ol><p>Check out the Figma link and let me know what you think!</p><p>Alex</p></div>""",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}, {"id": "starred", "name": "starred", "type": "system"}, {"id": "work", "name": "work", "type": "user"}],
                "attachments": None,
                "is_draft": False,
                "message_id": "msg_003_2@example.com",
                "references": "<msg_003_1@example.com>",
                "in_reply_to": "<msg_003_1@example.com>",
                "reply_to": None
            }
        ]
    },
    "thread_004": {
        "id": "thread_004",
        "history_id": "12348",
        "labels": [{"id": "inbox", "name": "inbox"}],
        "messages": [
            {
                "id": "msg_004_1",
                "thread_id": "thread_004",
                "connection_id": "conn_001",
                "title": "[GitHub] Pull Request #1234: Add user authentication",
                "subject": "[GitHub] Pull Request #1234: Add user authentication",
                "sender": {
                    "name": "GitHub",
                    "email": "notifications@github.com"
                },
                "to": [{"name": "Me", "email": "me@example.com"}],
                "cc": None,
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(hours_ago=12),
                "unread": False,
                "body": "A new pull request has been opened...",
                "processed_html": """<div><h3>Pull Request #1234</h3><p><strong>Add user authentication</strong></p><p>@johndoe has opened a pull request:</p><ul><li>Implements JWT-based authentication</li><li>Adds login/logout endpoints</li><li>Updates documentation</li></ul><p><a href="https://github.com/example/repo/pull/1234">View Pull Request</a></p></div>""",
                "blob_url": "",
                "decoded_body": """<div><h3>Pull Request #1234</h3><p><strong>Add user authentication</strong></p><p>@johndoe has opened a pull request:</p><ul><li>Implements JWT-based authentication</li><li>Adds login/logout endpoints</li><li>Updates documentation</li></ul><p><a href="https://github.com/example/repo/pull/1234">View Pull Request</a></p></div>""",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}],
                "attachments": None,
                "is_draft": False,
                "message_id": "msg_004_1@example.com",
                "references": None,
                "in_reply_to": None,
                "reply_to": None
            }
        ]
    },
    "thread_005": {
        "id": "thread_005",
        "history_id": "12349",
        "labels": [{"id": "inbox", "name": "inbox"}, {"id": "personal", "name": "personal"}],
        "messages": [
            {
                "id": "msg_005_1",
                "thread_id": "thread_005",
                "connection_id": "conn_001",
                "title": "Family Reunion Planning",
                "subject": "Family Reunion Planning",
                "sender": {
                    "name": "Mom",
                    "email": "mom@family.com"
                },
                "to": [
                    {"name": "Me", "email": "me@example.com"},
                    {"name": "Sister", "email": "sister@family.com"}
                ],
                "cc": None,
                "bcc": None,
                "tls": True,
                "received_on": _generate_timestamp(days_ago=1),
                "unread": True,
                "body": "Hi kids, let's plan the summer reunion...",
                "processed_html": """<div><p>Hi kids,</p><p>Let's plan the summer reunion! I was thinking the first weekend in July. What do you think?</p><p>Location ideas:</p><ul><li>Grandma's house</li><li>The lake cabin</li><li>City park with BBQ facilities</li></ul><p>Let me know your availability!</p><p>Love, Mom</p></div>""",
                "blob_url": "",
                "decoded_body": """<div><p>Hi kids,</p><p>Let's plan the summer reunion! I was thinking the first weekend in July. What do you think?</p><p>Location ideas:</p><ul><li>Grandma's house</li><li>The lake cabin</li><li>City park with BBQ facilities</li></ul><p>Let me know your availability!</p><p>Love, Mom</p></div>""",
                "tags": [{"id": "inbox", "name": "inbox", "type": "system"}, {"id": "personal", "name": "personal", "type": "user"}],
                "attachments": None,
                "is_draft": False,
                "message_id": "msg_005_1@example.com",
                "references": None,
                "in_reply_to": None,
                "reply_to": None
            }
        ]
    }
}

# Thread list items for mailbox views (lightweight representation)
# This is what gets returned by GET /mailboxes/:id/emails
# apps/server/app/api/mail/mock_data.py

# Thread list items for mailbox views (lightweight representation)
MOCK_THREAD_LIST: Dict[str, List[Dict[str, Any]]] = {
    "inbox": [
        {"id": "thread_001", "history_id": "12345"},
        {"id": "thread_002", "history_id": "12346"},
        {"id": "thread_004", "history_id": "12348"},
        {"id": "thread_005", "history_id": "12349"},
    ],
    "todo": [
        {"id": "thread_003", "history_id": "12347"}, 
    ],
    "done": [],
    "starred": [
        {"id": "thread_003", "history_id": "12347"},
    ],
    "sent": [],
    "drafts": [],
    "work": [
        {"id": "thread_001", "history_id": "12345"},
    ],
    "personal": [
        {"id": "thread_005", "history_id": "12349"},
    ]
}


def get_mailboxes() -> List[Dict[str, Any]]:
    """Return list of all mailboxes."""
    return MOCK_MAILBOXES


def get_emails_by_mailbox(
    mailbox_id: str,
    page: int = 1,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get paginated thread list for a mailbox.
    Returns thread IDs with historyId (lightweight) plus preview data.
    
    This mimics Zero's listThreads endpoint that returns:
    { threads: [{ id, historyId }], nextPageToken }
    
    Frontend then uses the thread IDs to render previews from the latest message.
    """
    threads = MOCK_THREAD_LIST.get(mailbox_id, [])
    
    # Calculate pagination
    total = len(threads)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_threads = threads[start_idx:end_idx]
    
    # Return thread list with basic IDs
    # Frontend will call GET /emails/:id for full details when needed
    return {
        "threads": paginated_threads,
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": end_idx < total,
        "has_prev": page > 1,
        "next_page_token": str(page + 1) if end_idx < total else None
    }


def get_email_by_id(thread_id: str) -> Optional[Dict[str, Any]]:
    """
    Get full thread detail with all messages.
    Returns IGetThreadResponse format following Zero's structure:
    {
        messages: ParsedMessage[],
        latest: ParsedMessage,
        hasUnread: boolean,
        totalReplies: number,
        labels: Label[],
        isLatestDraft?: boolean
    }
    """
    thread = MOCK_THREADS.get(thread_id)
    if not thread:
        return None
    
    messages = thread["messages"]
    latest = messages[-1]  # Last message is latest
    has_unread = any(msg["unread"] for msg in messages)
    total_replies = len(messages) - 1
    
    return {
        "messages": messages,
        "latest": latest,
        "has_unread": has_unread,
        "total_replies": total_replies,
        "labels": thread["labels"],
        "is_latest_draft": latest.get("is_draft", False)
    }


def update_email(thread_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update thread properties and MOVE thread between lists if labels are changed.
    """
    thread = MOCK_THREADS.get(thread_id)
    if not thread:
        return None
    
    latest = thread["messages"][-1]
    
    # Update unread status
    if "unread" in updates:
        latest["unread"] = updates["unread"]
    
    # Update starred
    if "starred" in updates:
        tags = latest["tags"]
        if updates["starred"]:
            if not any(t["id"] == "starred" for t in tags):
                tags.append({"id": "starred", "name": "starred", "type": "system"})
        else:
            latest["tags"] = [t for t in tags if t["id"] != "starred"]
    
    # LOGIC MỚI: Update labels và Di chuyển giữa các cột (MOCK_THREAD_LIST)
    if "labels" in updates:
        new_labels = updates["labels"] # Ví dụ: ["done"]
        
        # 1. Cập nhật metadata trong chi tiết email
        latest["tags"] = [{"id": l, "name": l, "type": "user"} for l in new_labels]
        thread["labels"] = [{"id": l, "name": l} for l in new_labels]

        # 2. DI CHUYỂN EMAIL TRONG MOCK_THREAD_LIST
        # Bước A: Xóa email khỏi TẤT CẢ các danh sách cột (inbox, todo, done) để tránh trùng lặp
        kanban_columns = ["inbox", "todo", "done"]
        for col in kanban_columns:
            if col in MOCK_THREAD_LIST:
                MOCK_THREAD_LIST[col] = [t for t in MOCK_THREAD_LIST[col] if t["id"] != thread_id]
        
        # Bước B: Thêm email vào danh sách cột mới
        for label in new_labels:
            target_col = label.lower()
            # Chỉ thêm nếu nhãn đó là một cột hợp lệ trong Kanban
            if target_col in kanban_columns:
                if target_col not in MOCK_THREAD_LIST:
                    MOCK_THREAD_LIST[target_col] = []
                
                # Thêm vào đầu danh sách
                MOCK_THREAD_LIST[target_col].insert(0, {
                    "id": thread_id,
                    "history_id": thread.get("history_id", "12345")
                })

    return get_email_by_id(thread_id)


def search_emails(query: str, mailbox_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Search emails by query string.
    Searches in subject, body, sender name/email.
    Returns thread previews (not full messages).
    """
    query_lower = query.lower()
    results = []
    
    # Filter threads by mailbox if specified
    if mailbox_id:
        thread_ids = [t["id"] for t in MOCK_THREAD_LIST.get(mailbox_id, [])]
    else:
        thread_ids = list(MOCK_THREADS.keys())
    
    for thread_id in thread_ids:
        thread = MOCK_THREADS.get(thread_id)
        if not thread:
            continue
        
        # Search in any message of the thread
        for message in thread["messages"]:
            # Search in subject, body, sender name, sender email
            if (
                query_lower in message["subject"].lower() or
                query_lower in message["body"].lower() or
                query_lower in message["sender"].get("name", "").lower() or
                query_lower in message["sender"]["email"].lower()
            ):
                # Return thread preview with latest message
                latest = thread["messages"][-1]
                results.append({
                    "id": thread_id,
                    "history_id": thread["history_id"],
                    "subject": latest["subject"],
                    "sender": latest["sender"],
                    "to": latest["to"],
                    "received_on": latest["received_on"],
                    "unread": latest["unread"],
                    "tags": latest["tags"],
                    "body": latest["body"][:150] + "..." if len(latest["body"]) > 150 else latest["body"],
                })
                break  # Only add thread once
    
    return results

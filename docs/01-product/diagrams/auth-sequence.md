# Auth Sequence — Email/Password + Google Sign-In

## Email/Password Login Flow

```mermaid
sequenceDiagram
    participant User
    participant ReactApp
    participant API as FastAPI
    participant Mongo as MongoDB

    User->>ReactApp: Enter email + password
    ReactApp->>ReactApp: Client-side validation
    ReactApp->>API: POST /auth/login { email, password }
    API->>Mongo: Verify user credentials
    API->>Mongo: Check password hash (bcrypt)
    alt Valid credentials
        API->>API: Generate JWT access token (15 min)
        API->>API: Generate JWT refresh token (7 days)
        API-->>ReactApp: { access_token, refresh_token }
        ReactApp->>ReactApp: Store access_token in-memory
        ReactApp->>ReactApp: Store refresh_token in localStorage
        ReactApp-->>User: Redirect to /inbox
    else Invalid credentials
        API-->>ReactApp: 401 Unauthorized { error }
        ReactApp-->>User: Display error message
    end
```

## Google Sign-In OAuth Flow

```mermaid
sequenceDiagram
    participant User
    participant ReactApp
    participant Google as Google OAuth
    participant API as FastAPI
    participant Mongo as MongoDB

    User->>ReactApp: Click "Sign in with Google"
    ReactApp->>Google: Initiate OAuth flow
    Google->>User: Google login prompt
    User->>Google: Authenticate with Google
    Google-->>ReactApp: Return Google credential/token
    ReactApp->>API: POST /auth/google { credential }
    API->>Google: Verify credential with Google
    Google-->>API: User info (email, name, etc.)
    alt First-time user
        API->>Mongo: Create new user account
    else Returning user
        API->>Mongo: Find existing user
    end
    API->>API: Generate JWT access token (15 min)
    API->>API: Generate JWT refresh token (7 days)
    API-->>ReactApp: { access_token, refresh_token }
    ReactApp->>ReactApp: Store access_token in-memory
    ReactApp->>ReactApp: Store refresh_token in localStorage
    ReactApp-->>User: Redirect to /inbox
```

## Token Refresh Flow

```mermaid
sequenceDiagram
    participant ReactApp
    participant API as FastAPI
    participant Mongo as MongoDB

    ReactApp->>API: GET /protected/endpoint<br/>Authorization: Bearer <access_token>
    alt Access token expired
        API-->>ReactApp: 401 Unauthorized
        ReactApp->>ReactApp: Check if refresh in progress
        alt No refresh in progress
            ReactApp->>ReactApp: Mark refresh in progress
            ReactApp->>API: POST /auth/refresh { refresh_token }
            API->>Mongo: Validate refresh token
            alt Valid refresh token
                API->>API: Generate new access token
                API-->>ReactApp: { access_token }
                ReactApp->>ReactApp: Update access_token in-memory
                ReactApp->>ReactApp: Clear refresh in progress
                ReactApp->>API: Retry original request<br/>Authorization: Bearer <new_access_token>
                API-->>ReactApp: 200 OK { data }
            else Invalid/expired refresh token
                API-->>ReactApp: 401 Unauthorized
                ReactApp->>ReactApp: Clear tokens, logout
                ReactApp-->>User: Redirect to /login
            end
        else Refresh in progress
            ReactApp->>ReactApp: Queue request, wait for refresh
            ReactApp->>API: Retry after refresh completes
        end
    else Valid access token
        API-->>ReactApp: 200 OK { data }
    end
```

> Magic-link authentication documented for future implementation.


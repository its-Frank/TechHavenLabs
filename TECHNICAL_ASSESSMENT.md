# Full-Stack Developer Technical Assessment

## Electron + Next.js Application Enhancement

### Overview

You will work on an existing Electron application built with Next.js and TypeScript. Your task is to implement a complete user authentication system and integrate secure user data management using modern full-stack development practices.

The goal of this assessment is to evaluate your ability to work within an existing codebase, design clean application architecture, implement secure authentication workflows, and follow professional software development practices.

---

# Development Workflow Requirements

Before starting development, please follow the Git workflow below.

### 1. Create a New Branch

Do not work directly on the main branch.

Create a new branch using your GitHub username as part of the branch name.

---

### 2. Make Incremental Commits

Commit your changes regularly during development.

Each commit should represent a meaningful development step.

---

### 3. Submit a Pull Request

After completing the assessment:

* Push your branch to the repository
* Create a Pull Request (PR) from your branch into the main branch
* Provide a clear PR description including:

  * Summary of implemented features
  * Technical decisions
  * Any limitations or additional notes



---

# Technical Requirements

## 1. User Authentication System

Implement a complete authentication flow.

---

## User Registration (Sign Up)

Users should be able to create a new account with:

* Name
* Email address
* Password

Requirements:

* Validate user input
* Securely hash passwords before storing them
* Save user information in PostgreSQL
* Handle duplicate email registration cases properly

---

## User Login (Sign In)

Implement login functionality.

Requirements:

* Authenticate users using email and password
* Generate a JSON Web Token (JWT) after successful authentication
* Return authentication credentials securely
* Handle invalid login attempts gracefully

---

# 2. JWT Authentication & Session Management

Implement token-based authentication.

Requirements:

* Use JWT for user authentication
* Manage authentication state using Zustand
* Store and update user session information
* Implement login/logout actions
* Protect authenticated application areas from unauthorized access

---

# 3. Database Integration

Use PostgreSQL for persistent data storage.

Requirements:

* Store user account information in PostgreSQL
* Implement proper database queries
* Maintain clean database structure
* Handle database errors appropriately

---

# 4. Protected User Area

Create a protected area inside the application.

Requirements:

* Unauthenticated users cannot access protected pages
* Display authenticated user information
* Allow users to log out
* Clear authentication state after logout

---

# Technical Expectations

Your implementation should demonstrate:

* Clean and maintainable TypeScript code
* Proper React component architecture
* Effective Zustand state management
* Secure authentication practices
* Clear separation of concerns
* Proper error handling
* Professional Git workflow

---

# Technology Stack

The project uses:

* Next.js
* Electron
* TypeScript
* React
* Zustand
* PostgreSQL
* JWT Authentication

Additional libraries may be used if they improve implementation quality.

---

# Evaluation Criteria

| Category                         | Weight |
| -------------------------------- | -----: |
| Functionality & completeness     |    30% |
| Code quality & architecture      |    20% |
| Authentication implementation    |    20% |
| Database integration             |    15% |
| Git workflow & commit quality    |    10% |
| User experience & error handling |     5% |

---

# Time Expectation

The estimated completion time is approximately **3 hours**.

Focus on delivering a clean, functional, and maintainable implementation.

Do not prioritize adding unnecessary features. Quality, structure, and engineering decisions are more important than the number of features completed.

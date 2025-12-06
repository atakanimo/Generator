# TASK MANAGEMENT & MEMORY PROTOCOL

1. **INITIAL CHECK (MANDATORY):** Before responding to ANY user request, you MUST read the content of `TASKS.md` to understand the project status, active context, and previous architectural decisions.

2. **TASK LOGGING:** After performing any code change or completing a request, you MUST append a new entry to `TASKS.md`.

3. **LOG FORMAT:**

   - **Date/Time:** [YYYY-MM-DD HH:MM]
   - **Task:** Brief description of what was done.
   - **AI Context/Comment:** (CRITICAL) Write your internal reasoning, what to watch out for next, and technical details so you don't forget the context in the next turn.
   - **Status:** [DONE] / [IN_PROGRESS] / [PENDING]

4. **AUTO-CREATION:** If `TASKS.md` does not exist, create it immediately with the first task.

## CODING RULES

1. **Component-level try-catch:** Component seviyesinde try-catch kullanılmamalı. Error handling thunk'larda yapılmalı.

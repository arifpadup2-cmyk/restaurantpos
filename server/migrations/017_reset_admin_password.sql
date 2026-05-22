-- Force-reset super admin password to env-var default
-- Hash = bcrypt('Bappan_kunhi@4', 10)
UPDATE admin_users
SET password = '$2a$10$1NToPJhiHXBXs6qqypNt1eYU1bMIJYJUkYsVa8sn3myBmI.vAu5qe'
WHERE username = 'arifpadup';

-- Also insert if not present
INSERT INTO admin_users (id, username, password, name, role)
SELECT 'admin-seed-001', 'arifpadup', '$2a$10$1NToPJhiHXBXs6qqypNt1eYU1bMIJYJUkYsVa8sn3myBmI.vAu5qe', 'Mohammed Arif', 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE username = 'arifpadup');

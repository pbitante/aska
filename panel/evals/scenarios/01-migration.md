# Change: rename `users.fullname` to `users.display_name`

Migration `0042_rename_fullname.sql`:

    ALTER TABLE users ADD COLUMN display_name TEXT;
    UPDATE users SET display_name = fullname;
    ALTER TABLE users DROP COLUMN fullname;

Application code is updated in the same deploy to read and write `display_name`. There is no down-migration. The `UPDATE` runs outside a transaction on a table of 4 million rows. The profile page will show the new name field immediately. The ticket asked only for the rename, but the PR also adds an optional `pronunciation` column "while we're here".

Should this ship?

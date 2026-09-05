-- Normalizes every existing phone number by stripping all whitespace, so
-- they match whatever the current login/registration flow will produce
-- going forward (see backend/src/utils/phone.js for the full explanation).
-- Safe to re-run - anything already normalized is simply left unchanged.

UPDATE users
SET phone = REGEXP_REPLACE(phone, '\s+', '', 'g')
WHERE phone ~ '\s';

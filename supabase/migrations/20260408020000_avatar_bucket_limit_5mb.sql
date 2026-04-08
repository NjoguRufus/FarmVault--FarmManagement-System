-- Increase avatar storage limit from 2MB to 5MB.
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'avatars';


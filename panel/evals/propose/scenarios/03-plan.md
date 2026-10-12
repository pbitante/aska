# Plan: move image uploads to direct-to-bucket uploads

1. Add a `POST /uploads/sign` endpoint that returns a pre-signed URL valid for 15 minutes.
2. Change the web client to upload straight to the bucket with that URL, then send the object key to `POST /photos`.
3. Delete the old `POST /photos/upload` multipart handler and its tests.
4. Backfill: copy existing images from the app server's disk into the bucket.
5. Point the CDN at the bucket.

Steps 1–3 ship in one release. There is no flag. The mobile app, which still uses `POST /photos/upload`, is released separately every two weeks. Step 4 has no script yet ("we'll write one"). Nobody has said what happens to uploads in flight during the deploy.

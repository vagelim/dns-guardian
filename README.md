# dns-guardian
Block first-party domains that are delegated to third-party

For example, say you visit a website my.store.com. The site loads tracking pixels from track.my.store.com but the NS records for track.my.store.com don't match the NS records for store.com, indicating that the DNS record is managed by another party. This extension would block those requests.

Uses google's dns service under the hood. Requires manifest v2.

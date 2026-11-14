# Bonozo Bots

The Bonozo Bots website, published with GitHub Pages at https://bonozo.github.io/.
It is a static site: edit `index.html` for content, `styles.css` for the design,
and `script.js` for the mobile navigation. Open `index.html` in a browser to
preview it locally. Changes pushed to the publishing branch are deployed by
GitHub Pages.

The contact form sends submissions through FormSubmit. After deploying, submit
the form once and confirm the activation email sent to the address in the form's
`action`. FormSubmit handles the spam check and confirmation page. The address
in the form action is public; update it there if the destination changes, and
confirm the new address with FormSubmit.

The idea board uses the Bonozo Bots Supabase project. `ideas-schema.sql` defines
the tables and narrowly scoped RPC functions; `ideas.js` uses the project's
public publishable key. Anonymous sign-ins must be enabled. Ideas are public,
and anonymous sessions provide one vote per idea per browser session, not
proof of one vote per person. Review submissions in the Supabase table editor;
deleting an idea also deletes its votes. Configure CAPTCHA and monitor Supabase
usage before relying on the board at scale: anonymous sign-ins and public
submissions can be abused. The board displays the top 100 ideas.

`ideas-images.sql` adds the public `idea-images` storage bucket and image RPCs
to the existing schema. Each idea can include up to three JPEG, PNG, or WebP
images of at most 2 MiB each. Images are public and are not moderated
automatically. Remove inappropriate images through Supabase Storage; deleting
an idea does not automatically remove its stored image objects. Failed or
interrupted uploads may also need cleanup in Storage. Monitor storage usage.

export const SEED_TEMPLATES = [
  {
    name: "Blogger Outreach",
    category: "outreach",
    subject: "Loved your article on {{topic}}",
    body_html: `<p>Hi {{first_name}},</p><p>I recently came across your article on {{topic}} and really enjoyed your take on {{specific_point}}.</p><p>I'm reaching out because I'm working on a piece about {{our_topic}} for {{our_site}} and I think {{their_angle}} would be a great fit. Would you be open to including a link to our resource?</p><p>Let me know if you'd be interested!</p><p>Best,<br/>{{sender_name}}</p>`,
    body_text: `Hi {{first_name}},\n\nI recently came across your article on {{topic}} and really enjoyed your take on {{specific_point}}.\n\nI'm reaching out because I'm working on a piece about {{our_topic}} for {{our_site}} and I think {{their_angle}} would be a great fit. Would you be open to including a link to our resource?\n\nLet me know if you'd be interested!\n\nBest,\n{{sender_name}}`,
  },
  {
    name: "Guest Post Pitch",
    category: "guest_post",
    subject: "Guest post idea for {{site_name}}",
    body_html: `<p>Hi {{first_name}},</p><p>I'm a big fan of {{site_name}} — particularly your recent post on {{their_article}}.</p><p>I'd love to contribute a guest post on {{proposed_topic}}. I think your audience would find it valuable because {{value_proposition}}.</p><p>I've written for {{past_publications}} and would be happy to share some writing samples.</p><p>Let me know if this sounds interesting!</p><p>Best,<br/>{{sender_name}}</p>`,
    body_text: `Hi {{first_name}},\n\nI'm a big fan of {{site_name}} — particularly your recent post on {{their_article}}.\n\nI'd love to contribute a guest post on {{proposed_topic}}. I think your audience would find it valuable because {{value_proposition}}.\n\nI've written for {{past_publications}} and would be happy to share some writing samples.\n\nLet me know if this sounds interesting!\n\nBest,\n{{sender_name}}`,
  },
  {
    name: "Resource Page Request",
    category: "resource_page",
    subject: "Resource suggestion for {{site_name}}",
    body_html: `<p>Hi {{first_name}},</p><p>I was looking at your resources page on {{topic}} and noticed you've put together a great list.</p><p>I thought you might want to add our guide on {{our_topic}} which covers {{value_proposition}}. It's been helpful for {{audience_type}} and I think your readers would find it useful too.</p><p>Here it is: {{our_url}}</p><p>Thanks for considering!</p><p>Best,<br/>{{sender_name}}</p>`,
    body_text: `Hi {{first_name}},\n\nI was looking at your resources page on {{topic}} and noticed you've put together a great list.\n\nI thought you might want to add our guide on {{our_topic}} which covers {{value_proposition}}. It's been helpful for {{audience_type}} and I think your readers would find it useful too.\n\nHere it is: {{our_url}}\n\nThanks for considering!\n\nBest,\n{{sender_name}}`,
  },
  {
    name: "Skyscraper Technique",
    category: "skyscraper",
    subject: "Your {{topic}} post — I created an enhanced version",
    body_html: `<p>Hi {{first_name}},</p><p>I'm a regular reader of {{site_name}} and really enjoyed your post on {{their_article}}.</p><p>I actually created a more comprehensive version that builds on the topic — it covers {{whats_new}} and has some additional research on {{specific_aspect}}.</p><p>I thought you might want to check it out: {{our_url}}</p><p>If you find it valuable, I'd love it if you'd consider linking to it from your post — it could be a great resource for your readers too.</p><p>Best,<br/>{{sender_name}}</p>`,
    body_text: `Hi {{first_name}},\n\nI'm a regular reader of {{site_name}} and really enjoyed your post on {{their_article}}.\n\nI actually created a more comprehensive version that builds on the topic — it covers {{whats_new}} and has some additional research on {{specific_aspect}}.\n\nI thought you might want to check it out: {{our_url}}\n\nIf you find it valuable, I'd love it if you'd consider linking to it from your post — it could be a great resource for your readers too.\n\nBest,\n{{sender_name}}`,
  },
  {
    name: "Link Reclamation",
    category: "link_reclamation",
    subject: "Broken link on {{site_name}} — found a replacement",
    body_html: `<p>Hi {{first_name}},</p><p>I was browsing {{site_name}} and noticed that your page {{their_page}} has a broken link pointing to {{broken_url}}.</p><p>I have a relevant replacement at {{our_url}} that covers {{our_topic}} — I think it would be a good fit for your readers.</p><p>Just wanted to give you a heads-up!</p><p>Best,<br/>{{sender_name}}</p>`,
    body_text: `Hi {{first_name}},\n\nI was browsing {{site_name}} and noticed that your page {{their_page}} has a broken link pointing to {{broken_url}}.\n\nI have a relevant replacement at {{our_url}} that covers {{our_topic}} — I think it would be a good fit for your readers.\n\nJust wanted to give you a heads-up!\n\nBest,\n{{sender_name}}`,
  },
]

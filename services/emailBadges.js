/**
 * "Get it on Google Play" / "Download on the App Store" badges shown at the bottom of every
 * FashionTally email. They are images (email apps strip inline SVG), served by this backend from
 * public/email (made by email-assets/store-badges/render-badges.mjs), drawn at 2x for sharp
 * screens and shown at half size. Tables + inline styles so they hold up in Gmail and Outlook.
 */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.fashion.fashiontally';
const APP_STORE_URL = 'https://apps.apple.com/gb/app/fashion-tally/id6769135696';

const imageBase = () => `${String(process.env.BACKEND_URL || 'https://backend.fashiontally.com').replace(/\/+$/, '')}/email`;

const appBadges = () => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px auto;border-collapse:collapse;">
  <tr>
    <td style="padding:0 4px;">
      <a href="${PLAY_URL}" target="_blank" style="text-decoration:none;display:inline-block;">
        <img src="${imageBase()}/badge-google-play.png" width="148" height="42" alt="Get it on Google Play" style="display:block;border:0;outline:none;width:148px;height:42px;" />
      </a>
    </td>
    <td style="padding:0 4px;">
      <a href="${APP_STORE_URL}" target="_blank" style="text-decoration:none;display:inline-block;">
        <img src="${imageBase()}/badge-app-store.png" width="150" height="42" alt="Download on the App Store" style="display:block;border:0;outline:none;width:150px;height:42px;" />
      </a>
    </td>
  </tr>
</table>`;

/** Plain-text version for the text part of emails */
const appLinksText = () => `Get the app: Google Play ${PLAY_URL} · App Store ${APP_STORE_URL}`;

module.exports = { appBadges, appLinksText, PLAY_URL, APP_STORE_URL };

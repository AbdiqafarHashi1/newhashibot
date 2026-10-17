const messages:Record<string,string>={
 ADMIN_REQUIRED:'Administrator access is required.',AUTHENTICATION_REQUIRED:'Please sign in again.',
 VALID_EMAIL_REQUIRED:'Enter a valid email address.',VALID_TELEGRAM_HANDLE_REQUIRED:'Enter a Telegram username with 5–32 letters, numbers or underscores.',INTERNATIONAL_PHONE_REQUIRED:'Enter the phone number with its country code, for example +254711123456.',
 CONTACT_ALREADY_RECORDED:'That contact is already in the pipeline. Open the existing prospect.',PROSPECT_CHANGED_RELOAD:'This prospect changed in another window. Refresh it before saving.',
 OPT_OUT_CANNOT_BE_OVERRIDDEN:'This contact opted out. Its contact details and suppression must be preserved.',CONTACT_SUPPRESSED:'This contact opted out. Further contact is suppressed.',CONTACT_PERMISSION_REQUIRED:'Save confirmed contact permission before preparing outreach.',ACTIVITY_NOTE_REQUIRED:'Add an activity note first.',
 SAVE_SETTINGS_BEFORE_VERIFICATION:'Save the provider settings before verifying them.',SETTINGS_CHANGED_RELOAD:'Provider settings changed. Refresh and verify the current revision.',
 WHOP_FIELDS_REQUIRED:'Add the Whop API key, company ID, webhook signing secret and a plan ID.',DARAJA_FIELDS_REQUIRED:'Complete the Daraja credentials, business shortcode, receiving Till or PayBill and callback URL.',
 USE_THIS_PROJECT_MPESA_CALLBACK:'Use the callback URL shown for this HashiBot project.',WHOP_PLAN_PRICE_OR_ACCOUNT_MISMATCH:'The Whop plan does not match the configured company, price, currency or monthly billing terms.',WHOP_PROVIDER_REQUEST_FAILED:'Whop did not confirm the request. Check the provider credentials and plan.',MPESA_AUTH_FAILED:'Daraja authentication failed. Check the credentials and sandbox or production environment.',
 APPROVED_MPESA_PRICES_REQUIRED:'M-Pesa needs approved 7-day and 30-day VIP prices in whole Kenyan shillings.',ACTIVE_PRICES_REQUIRED:'No active price is available for this provider.',MATCHING_PROVIDER_PLANS_REQUIRED:'Add a provider plan that matches an active HashiBot price.',
 SETTINGS_SAVE_FAILED:'The settings were not saved. Check that the commerce migrations and Vault are available.',SETTINGS_UNAVAILABLE:'Provider settings could not be loaded. Check the backend connection and migrations.',COMMERCE_CONFIGURATION_UNAVAILABLE:'Commerce configuration is unavailable. Restore the backend and apply the release migrations.',
 RECOVERY_CLOCK_NOT_CONFIGURED:'Automatic payment recovery could not be scheduled. Check pg_cron, pg_net and the existing scanner cron token before enabling checkout.',
 RECOVERY_WORKER_NOT_CONFIGURED:'The backend recovery service is not configured.',RECOVERY_REQUEST_NOT_CONFIRMED:'The recovery worker did not confirm completion. Inspect payment events before retrying.',RECOVERY_STATUS_UNAVAILABLE:'Payment event status could not be loaded.',
};
/** Only known server reason codes become UI messages; database/provider details are never echoed. */
export async function adminRequestError(data:unknown,error:unknown){
 let body=data as any;const context=(error as any)?.context;
 if(!body&&context instanceof Response){try{body=await context.clone().json()}catch{/* The transport may return a non-JSON error page. */}}
 const code=body?.error??body?.reason;if(typeof code==='string'&&messages[code])return messages[code];
 if(context instanceof Response&&context.status===401)return 'Please sign in again.';
 if(context instanceof Response&&context.status===403)return 'Administrator access is required.';
 return 'The request could not be confirmed. Check the backend connection, refresh the page and retry.';
}

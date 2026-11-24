//! Row-Level-Security protected data (PostgREST) and the account-deletion function. Every call uses the signed-in user's access
//! token; the database decides what that user may see (see `supabase/migrations`). Nothing here can reach another user's rows.

use crate::error::{AuthError, Result};
use crate::gotrue::Client;
use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Device {
    pub id: String,
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub last_seen: String,
    pub revoked: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entitlement {
    pub plan: String,
    pub status: String,
    pub device_limit: i64,
}

impl Default for Entitlement {
    fn default() -> Self {
        Entitlement { plan: "free".into(), status: "active".into(), device_limit: 2 }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeviceRegistration {
    Ok,
    /// The plan's device limit is reached; the user can revoke a device in Account.
    LimitReached,
    /// This device was removed from the account; the app signs out locally.
    Revoked,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}

pub fn profile(c: &Client, token: &str, uid: &str) -> Result<(String, String)> {
    let v = c.call("GET", &format!("/rest/v1/profiles?id=eq.{}&select=display_name,status", crate::pkce::urlencode(uid)), Some(token), None)?;
    let row = v.get(0).ok_or(AuthError::Unavailable)?;
    Ok((s(row, "display_name"), if s(row, "status").is_empty() { "active".into() } else { s(row, "status") }))
}

pub fn entitlement(c: &Client, token: &str) -> Result<Entitlement> {
    let v = c.call("GET", "/rest/v1/entitlements?select=plan,status,device_limit&limit=1", Some(token), None)?;
    Ok(match v.get(0) {
        Some(row) => Entitlement { plan: s(row, "plan"), status: s(row, "status"), device_limit: row.get("device_limit").and_then(Value::as_i64).unwrap_or(2) },
        None => Entitlement::default(),
    })
}

pub fn devices(c: &Client, token: &str) -> Result<Vec<Device>> {
    let v = c.call("GET", "/rest/v1/devices?select=id,device_id,name,platform,last_seen,revoked_at&order=last_seen.desc", Some(token), None)?;
    Ok(v.as_array()
        .map(|rows| {
            rows.iter()
                .map(|r| Device { id: s(r, "id"), device_id: s(r, "device_id"), name: s(r, "name"), platform: s(r, "platform"), last_seen: s(r, "last_seen"), revoked: r.get("revoked_at").map_or(false, |x| !x.is_null()) })
                .collect()
        })
        .unwrap_or_default())
}

pub fn register_device(c: &Client, token: &str, device_id: &str, name: &str, platform: &str, app_version: &str, explicit: bool) -> Result<DeviceRegistration> {
    let v = c.call(
        "POST",
        "/rest/v1/rpc/register_device",
        Some(token),
        Some(json!({"p_device_id": device_id, "p_name": name, "p_platform": platform, "p_app_version": app_version, "p_explicit": explicit})),
    )?;
    Ok(match v.as_str() {
        Some("limit_reached") => DeviceRegistration::LimitReached,
        Some("revoked") => DeviceRegistration::Revoked,
        _ => DeviceRegistration::Ok,
    })
}

pub fn revoke_device(c: &Client, token: &str, id: &str) -> Result<()> {
    c.call("POST", "/rest/v1/rpc/revoke_device", Some(token), Some(json!({"p_id": id}))).map(|_| ())
}

pub fn set_display_name(c: &Client, token: &str, uid: &str, name: &str) -> Result<()> {
    c.call("PATCH", &format!("/rest/v1/profiles?id=eq.{}", crate::pkce::urlencode(uid)), Some(token), Some(json!({"display_name": name}))).map(|_| ())
}

/// Calls the `delete-account` Edge Function, which verifies the caller's token and deletes that user (service role stays server-side).
pub fn delete_account(c: &Client, token: &str) -> Result<()> {
    c.call("POST", "/functions/v1/delete-account", Some(token), Some(json!({"confirm": true}))).map(|_| ())
}

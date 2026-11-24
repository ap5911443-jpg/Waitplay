//! Where the long-lived secret (the refresh token) lives: the operating system's protected store, never a file.
//!
//! - Windows: Credential Manager (`CredWriteW`), a generic credential per user; Windows protects the blob with DPAPI for that user.
//! - macOS: the login Keychain (generic password), via Security.framework.
//! The stored value is a small JSON document, `{"v":1,"user_id":...,"refresh_token":...}`; the short-lived access token is kept in
//! memory only. Callers use the [`SecretStore`] trait so the session logic is tested without touching the real store.

use crate::error::{AuthError, Result};

pub trait SecretStore: Send + Sync {
    fn load(&self) -> Result<Option<String>>;
    fn save(&self, secret: &str) -> Result<()>;
    fn delete(&self) -> Result<()>;
}

/// For tests and for platforms without a secure store (nothing is ever written to disk).
#[derive(Default)]
pub struct MemoryStore(std::sync::Mutex<Option<String>>);

impl SecretStore for MemoryStore {
    fn load(&self) -> Result<Option<String>> {
        Ok(self.0.lock().unwrap_or_else(|e| e.into_inner()).clone())
    }
    fn save(&self, secret: &str) -> Result<()> {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(secret.to_string());
        Ok(())
    }
    fn delete(&self) -> Result<()> {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
        Ok(())
    }
}

/// The real store for this platform. `name` separates items (production: `com.waitplay.app`; tests use their own).
pub fn os_store(name: &str) -> Box<dyn SecretStore> {
    #[cfg(windows)]
    {
        Box::new(windows_store::CredentialManager::new(name))
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos_store::Keychain::new(name))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = name;
        Box::new(MemoryStore::default())
    }
}

#[cfg(windows)]
mod windows_store {
    use super::*;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::ERROR_NOT_FOUND;
    use windows::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    pub struct CredentialManager {
        target: Vec<u16>,
    }

    impl CredentialManager {
        pub fn new(name: &str) -> Self {
            Self { target: format!("{name}/session").encode_utf16().chain(std::iter::once(0)).collect() }
        }
    }

    fn storage(e: windows::core::Error) -> AuthError {
        AuthError::Storage(format!("Credential Manager: {e}"))
    }

    impl SecretStore for CredentialManager {
        fn load(&self) -> Result<Option<String>> {
            let mut out: *mut CREDENTIALW = std::ptr::null_mut();
            // SAFETY: `target` is a NUL-terminated UTF-16 string that outlives the call; on success `out` points to a credential that
            // we copy from and release with CredFree.
            unsafe {
                match CredReadW(PCWSTR(self.target.as_ptr()), CRED_TYPE_GENERIC, None, &mut out) {
                    Ok(()) => {
                        let cred = &*out;
                        let blob = std::slice::from_raw_parts(cred.CredentialBlob, cred.CredentialBlobSize as usize).to_vec();
                        CredFree(out as *const _);
                        Ok(Some(String::from_utf8(blob).map_err(|_| AuthError::Storage("stored secret is not valid UTF-8".into()))?))
                    }
                    Err(e) if e.code() == ERROR_NOT_FOUND.to_hresult() => Ok(None),
                    Err(e) => Err(storage(e)),
                }
            }
        }

        fn save(&self, secret: &str) -> Result<()> {
            let mut blob = secret.as_bytes().to_vec();
            let mut user: Vec<u16> = "WaitPlay".encode_utf16().chain(std::iter::once(0)).collect();
            let mut target = self.target.clone();
            let cred = CREDENTIALW {
                Flags: CRED_FLAGS(0),
                Type: CRED_TYPE_GENERIC,
                TargetName: PWSTR(target.as_mut_ptr()),
                CredentialBlobSize: blob.len() as u32,
                CredentialBlob: blob.as_mut_ptr(),
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                UserName: PWSTR(user.as_mut_ptr()),
                ..Default::default()
            };
            // SAFETY: every pointer in `cred` refers to a buffer that lives until after the call.
            unsafe { CredWriteW(&cred, 0) }.map_err(storage)
        }

        fn delete(&self) -> Result<()> {
            // SAFETY: NUL-terminated target string that outlives the call.
            match unsafe { CredDeleteW(PCWSTR(self.target.as_ptr()), CRED_TYPE_GENERIC, None) } {
                Ok(()) => Ok(()),
                Err(e) if e.code() == ERROR_NOT_FOUND.to_hresult() => Ok(()),
                Err(e) => Err(storage(e)),
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod macos_store {
    use super::*;
    use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

    /// errSecItemNotFound
    const NOT_FOUND: i32 = -25300;

    pub struct Keychain {
        service: String,
    }

    impl Keychain {
        pub fn new(name: &str) -> Self {
            Self { service: name.to_string() }
        }
    }

    fn storage(e: security_framework::base::Error) -> AuthError {
        AuthError::Storage(format!("Keychain: {e}"))
    }

    impl SecretStore for Keychain {
        fn load(&self) -> Result<Option<String>> {
            match get_generic_password(&self.service, "session") {
                Ok(bytes) => Ok(Some(String::from_utf8(bytes).map_err(|_| AuthError::Storage("stored secret is not valid UTF-8".into()))?)),
                Err(e) if e.code() == NOT_FOUND => Ok(None),
                Err(e) => Err(storage(e)),
            }
        }
        fn save(&self, secret: &str) -> Result<()> {
            set_generic_password(&self.service, "session", secret.as_bytes()).map_err(storage)
        }
        fn delete(&self) -> Result<()> {
            match delete_generic_password(&self.service, "session") {
                Ok(()) => Ok(()),
                Err(e) if e.code() == NOT_FOUND => Ok(()),
                Err(e) => Err(storage(e)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trips() {
        let s = MemoryStore::default();
        assert_eq!(s.load().unwrap(), None);
        s.save("one").unwrap();
        s.save("two").unwrap();
        assert_eq!(s.load().unwrap().as_deref(), Some("two"));
        s.delete().unwrap();
        s.delete().unwrap();
        assert_eq!(s.load().unwrap(), None);
    }

    /// Talks to the real Credential Manager / Keychain with a throw-away item name.
    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn the_os_store_round_trips_and_overwrites_and_deletes() {
        let name = format!("com.waitplay.test.{}", std::process::id());
        let s = os_store(&name);
        assert_eq!(s.load().unwrap(), None, "fresh item");
        let secret = format!("{{\"v\":1,\"user_id\":\"u\",\"refresh_token\":\"{}\"}}", "x".repeat(400));
        s.save(&secret).unwrap();
        assert_eq!(s.load().unwrap().as_deref(), Some(secret.as_str()));
        s.save("replaced").unwrap();
        assert_eq!(s.load().unwrap().as_deref(), Some("replaced"));
        s.delete().unwrap();
        assert_eq!(s.load().unwrap(), None);
        s.delete().unwrap();
    }
}

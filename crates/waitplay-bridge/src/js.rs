//! JavaScript value semantics the TypeScript bridge relied on (`String(x)`, truthiness), so event data is interpreted
//! exactly as before.

use serde_json::Value;

/// `Boolean(value)`.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_none_or(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_)) | Some(Value::Object(_)) => true,
    }
}

/// `String(value)` for a JSON-derived value.
pub fn to_js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => number_to_js_string(n),
        Value::String(s) => s.clone(),
        Value::Array(a) => a
            .iter()
            .map(|x| if x.is_null() { String::new() } else { to_js_string(x) })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

fn number_to_js_string(n: &serde_json::Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    let f = n.as_f64().unwrap_or(f64::NAN);
    if f.is_nan() {
        return "NaN".into();
    }
    if f == f.trunc() && f.abs() < 1e21 {
        return format!("{:.0}", f);
    }
    // Rust's shortest round-trip form matches JS for the common range; JS switches to exponents outside 1e-6..1e21.
    let abs = f.abs();
    if (1e-6..1e21).contains(&abs) {
        format!("{}", f)
    } else {
        let s = format!("{:e}", f);
        match s.split_once('e') {
            Some((m, e)) if !e.starts_with('-') => format!("{}e+{}", m, e),
            _ => s,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn truthiness() {
        assert!(!truthy(None));
        assert!(!truthy(Some(&json!(0))));
        assert!(!truthy(Some(&json!(""))));
        assert!(!truthy(Some(&json!(null))));
        assert!(truthy(Some(&json!("x"))));
        assert!(truthy(Some(&json!(1))));
        assert!(truthy(Some(&json!({}))));
        assert!(truthy(Some(&json!([]))));
        assert!(!truthy(Some(&json!(false))));
    }

    #[test]
    fn stringification() {
        assert_eq!(to_js_string(&json!("a")), "a");
        assert_eq!(to_js_string(&json!(42)), "42");
        assert_eq!(to_js_string(&json!(1.5)), "1.5");
        assert_eq!(to_js_string(&json!(2.0)), "2");
        assert_eq!(to_js_string(&json!(true)), "true");
        assert_eq!(to_js_string(&json!([1, null, "a"])), "1,,a");
        assert_eq!(to_js_string(&json!({"a": 1})), "[object Object]");
        assert_eq!(to_js_string(&json!(1e21)), "1e+21");
    }
}

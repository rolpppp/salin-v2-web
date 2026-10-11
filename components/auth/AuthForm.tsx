"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Field, Input } from "@/components/field/Field";
import { signInAction, signUpAction, type AuthFormState } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/schemas";
import styles from "./auth.module.css";

const initial: AuthFormState = {};

type Props = {
  mode: "sign-in" | "sign-up";
  /** Already sanitised with safeNext on the server. */
  next?: string;
  /** Message from a failed email link (`?error=link`). */
  linkError?: boolean;
};

/** Email + password, the same method the Salin app uses, so one account works on both. */
export function AuthForm({ mode, next, linkError }: Props) {
  const signIn = mode === "sign-in";
  const [state, action, pending] = useActionState(signIn ? signInAction : signUpAction, initial);
  const other = next && next !== "/today" ? `?next=${encodeURIComponent(next)}` : "";
  const formError = state.error ?? (linkError ? "That link didn't work or has expired. Sign in, or create your account again." : undefined);

  return (
    <div className={styles.wrap}>
      <Card className={styles.card} aria-labelledby="auth-h">
        <div className={styles.head}>
          <Image className={styles.logo} src="/logo.png" alt="" width={40} height={37} />
          <h1 id="auth-h" className={styles.h1}>
            {signIn ? "Sign in" : "Create your account"}
          </h1>
          <p className={styles.lede}>
            {signIn ? "Use the same email and password as the Salin app." : "Use this email and password in the Salin app too."}
          </p>
        </div>

        {state.notice ? (
          <p className={styles.notice} role="status">
            {state.notice}
          </p>
        ) : (
          <form action={action} className={styles.form} noValidate>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <div role="alert" className={styles.formError}>
              {formError}
            </div>
            <Field label="Email" required error={state.fieldErrors?.email}>
              {(c) => (
                <Input {...c} name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} />
              )}
            </Field>
            <Field
              label="Password"
              required
              hint={signIn ? undefined : `At least ${PASSWORD_MIN} characters.`}
              error={state.fieldErrors?.password}
            >
              {(c) => <Input {...c} name="password" type="password" autoComplete={signIn ? "current-password" : "new-password"} />}
            </Field>
            <Button type="submit" variant="primary" loading={pending} loadingLabel={signIn ? "Signing in" : "Creating account"}>
              {signIn ? "Sign in" : "Create account"}
            </Button>
          </form>
        )}

        <p className={styles.alt}>
          {signIn ? (
            <>
              New to Salin? <Link href={`/sign-up${other}`}>Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href={`/sign-in${other}`}>Sign in</Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

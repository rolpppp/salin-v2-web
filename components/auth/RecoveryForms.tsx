"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Field, Input } from "@/components/field/Field";
import { forgotPasswordAction, resetPasswordAction, type AuthFormState } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/schemas";
import styles from "./auth.module.css";

const initial: AuthFormState = {};

function Head({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className={styles.head}>
      <Image className={styles.logo} src="/logo.png" alt="" width={40} height={37} />
      <h1 id={id} className={styles.h1}>
        {title}
      </h1>
      <p className={styles.lede}>{children}</p>
    </div>
  );
}

export function ForgotPasswordForm({ email, linkError }: { email?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  const formError =
    state.error ?? (linkError ? "This reset link has expired or was opened in a different browser. Enter your email to get a new one." : undefined);

  return (
    <div className={styles.wrap}>
      <Card className={styles.card} aria-labelledby="forgot-h">
        <Head id="forgot-h" title="Reset your password">
          We&apos;ll email you a link to choose a new one.
        </Head>

        {state.notice ? (
          <>
            <p className={styles.notice} role="status">
              {state.notice}
            </p>
            <form action={action} className={styles.form}>
              <input type="hidden" name="email" value={state.email ?? ""} />
              <Button type="submit" variant="soft" loading={pending} loadingLabel="Sending">
                Send it again
              </Button>
            </form>
          </>
        ) : (
          <form action={action} className={styles.form} noValidate>
            <div role="alert" className={styles.formError}>
              {formError}
            </div>
            <Field label="Email" required error={state.fieldErrors?.email}>
              {(c) => (
                <Input {...c} name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email ?? email} />
              )}
            </Field>
            <Button type="submit" variant="primary" loading={pending} loadingLabel="Sending">
              Send reset link
            </Button>
          </form>
        )}

        <p className={styles.alt}>
          Remembered it? <Link href="/sign-in">Back to sign in</Link>
        </p>
      </Card>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.expired) return <ResetLinkExpired />;

  return (
    <div className={styles.wrap}>
      <Card className={styles.card} aria-labelledby="reset-h">
        <Head id="reset-h" title="Choose a new password">
          This is also the password for the Salin phone app. It&apos;s the same account.
        </Head>
        <form action={action} className={styles.form} noValidate>
          <div role="alert" className={styles.formError}>
            {state.error}
          </div>
          <Field label="New password" required hint={`At least ${PASSWORD_MIN} characters.`} error={state.fieldErrors?.password}>
            {(c) => <Input {...c} name="password" type="password" autoComplete="new-password" />}
          </Field>
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving">
            Save new password
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Shown instead of the form when there is no recovery session. */
export function ResetLinkExpired({ signedInEmail }: { signedInEmail?: string }) {
  const signedIn = signedInEmail !== undefined;
  const href = signedInEmail ? `/forgot-password?email=${encodeURIComponent(signedInEmail)}` : "/forgot-password";
  return (
    <div className={styles.wrap}>
      <Card className={styles.card} aria-labelledby="expired-h">
        <Head id="expired-h" title={signedIn ? "Change your password" : "Reset link didn't work"}>
          {signedIn ? "To change your password, use a reset link from your email." : "This reset link has expired or was opened in a different browser."}
        </Head>
        <p className={styles.alt}>
          <Link href={href}>Get a new reset link</Link>
        </p>
      </Card>
    </div>
  );
}

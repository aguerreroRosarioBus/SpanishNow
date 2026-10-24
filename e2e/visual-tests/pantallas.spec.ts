import { test, expect } from "@playwright/test";

// Toda la API se intercepta: estas pruebas no usan cuentas, bases ni proveedores reales.
const me = {
  id: 1,
  name: "Admin Ejemplo",
  email: "admin@example.test",
  role: "teacher",
  permissions: ["users.manage", "test_users.manage"],
  isTestAccount: true,
};
const users = [
  {
    ...me,
    fixedAdmin: true,
    isTestAccount: false,
    suspendedAt: null,
    createdAt: "2026-10-01T12:00:00Z",
    coursesCount: 4,
    enrollmentsCount: 0,
  },
  {
    id: 2,
    name: "Ana Ejemplo",
    email: "ana@example.test",
    role: "student",
    permissions: [],
    fixedAdmin: false,
    isTestAccount: false,
    suspendedAt: null,
    createdAt: "2026-10-21T12:00:00Z",
    coursesCount: 0,
    enrollmentsCount: 2,
  },
  {
    id: 3,
    name: "Carlos Prueba",
    email: "carlos@example.test",
    role: "teacher",
    permissions: [],
    fixedAdmin: false,
    isTestAccount: true,
    suspendedAt: "2026-10-22T12:00:00Z",
    createdAt: "2026-10-20T12:00:00Z",
    coursesCount: 0,
    enrollmentsCount: 0,
  },
];
const session = {
  id: 10,
  teacherId: 1,
  teacher: { id: 1, name: me.name, timeZone: "America/Argentina/Cordoba" },
  kind: "individual",
  cohortId: null,
  status: "cancelled",
  version: 1,
  startsAt: "2026-10-27T14:00:00Z",
  endsAt: "2026-10-27T14:50:00Z",
  localStart: "2026-10-27T11:00",
  timeZone: "America/Argentina/Cordoba",
  utcOffset: "-03:00",
  minutes: 50,
  participants: [
    {
      userId: 2,
      name: "Ana Ejemplo",
      status: "cancelled",
      acceptedVersion: 1,
      attendance: "pending",
    },
  ],
  proposal: null,
  proposals: [],
  sync: [],
  rules: null,
  groupResolutionRequired: false,
  timeZoneRulesChanged: false,
  serverNow: "2026-10-23T12:00:00Z",
  replacementSessionId: null,
};
const conversation = {
  id: 1,
  role: "teacher",
  canSendOffers: true,
  counterpart: { id: 2, name: "Ana Ejemplo", role: "student" },
  context: null,
  lastMessage: {
    seq: 3,
    type: "text",
    senderIsMe: true,
    preview: "Nos vemos en la próxima clase",
    eventCode: null,
    hidden: false,
    createdAt: "2026-10-23T15:00:00Z",
  },
  lastMessageSeq: 3,
  lastMessageAt: "2026-10-23T15:00:00Z",
  lastReadSeq: 3,
  unreadCount: 1,
  teacherReplied: true,
  blockedByMe: false,
  blockedByOther: false,
  reportedByMe: false,
  createdAt: "2026-10-22T12:00:00Z",
};
const message = {
  id: 1,
  seq: 1,
  type: "text",
  senderId: 2,
  senderRole: "student",
  mine: false,
  body: "¡Hola! ¿Podemos cambiar el horario de la clase?",
  hidden: false,
  clientMessageId: null,
  context: null,
  offerId: null,
  classSessionId: null,
  proposalVersion: null,
  eventCode: null,
  eventParams: null,
  createdAt: "2026-10-23T12:00:00Z",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", "ficticio-qa");
    localStorage.setItem("spanishnow.locale", "es");
  }, me);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace("/api", "");
    let data: unknown = [];
    if (p === "/auth/me") data = { user: me };
    else if (p === "/features")
      data = { chat: true, class_packages: true, class_scheduling: true };
    else if (p === "/me/preferences")
      data = {
        locale: "es",
        timeZone: "America/Argentina/Cordoba",
        timeZoneConfirmedAt: "2026-10-22T12:00:00Z",
        chatUnreadEmail: false,
        ...(req.method() === "PATCH" ? req.postDataJSON() : {}),
      };
    else if (p === "/admin/permissions")
      data = ["users.manage", "test_users.manage"].map((key) => ({
        key,
        label: key,
        description: key,
      }));
    else if (p === "/admin/users")
      data = { users, total: users.length, page: 1, pageSize: 25 };
    else if (p === "/admin/users/2" && req.method() === "PATCH")
      data = { ...users[1], ...req.postDataJSON() };
    else if (p === "/class-sessions")
      data = { items: [session], truncated: false };
    else if (p === "/class-sessions/reminders") data = { items: [] };
    else if (p === "/class-sessions/options")
      data = { students: [], purchases: [], cohorts: [] };
    else if (p === "/class-sessions/10") data = session;
    else if (p === "/courses")
      data = [
        {
          id: 1,
          title: "Historias para conversar",
          slug: "historias",
          published: true,
          teacherId: 1,
        },
      ];
    else if (p === "/live-classes/google/status")
      data = {
        configured: false,
        connected: true,
        email: "docente@example.test",
      };
    else if (p === "/live-classes")
      data = ["live", "draft", "ended"].map((status, i) => ({
        id: i + 1,
        teacherId: 1,
        title: [
          "Conversación de los viernes",
          "Próxima historia",
          "Nuestra última clase",
        ][i],
        status,
        courseId: null,
        updatedAt: "2026-10-23T12:00:00Z",
      }));
    else if (p === "/teacher/sales/summary")
      data = {
        totals: [
          {
            currency: "usd",
            net: 8872,
            gross: 14754,
            refunds: 5882,
            orders: 6,
            refundsCount: 2,
          },
        ],
        byMonth: [{ currency: "usd", month: "2026-10", net: 8872, orders: 6 }],
        byCourse: [],
      };
    else if (p === "/teacher/coupons")
      data = [1, 2].map((id) => ({
        id,
        code: id === 1 ? "REGALO100" : "BIENVENIDA20",
        kind: "percent",
        percentOff: id === 1 ? 100 : 20,
        active: true,
        courseId: id === 1 ? 1 : null,
        redemptions: 1,
        maxRedemptions: 5,
        expiresAt: null,
      }));
    else if (p === "/teacher/affiliates")
      data = [
        {
          id: 1,
          name: "Laura Ejemplo",
          email: "laura@example.test",
          code: "LAURAPARTNER",
          commissionPercent: 30,
          active: true,
          stats: [
            {
              currency: "usd",
              orders: 1,
              sales: 2392,
              commission: 717,
              paid: 0,
              owed: 717,
            },
          ],
        },
      ];
    else if (p === "/conversations/unread")
      data = { conversations: 1, messages: 1 };
    else if (p === "/conversations")
      data = { items: [conversation], nextCursor: null };
    else if (p === "/conversations/1") data = conversation;
    else if (p === "/conversations/1/messages")
      data = {
        items: url.searchParams.has("afterSeq")
          ? []
          : [
              message,
              {
                ...message,
                id: 2,
                seq: 2,
                type: "session_proposal",
                classSessionId: 10,
                body: null,
              },
              {
                ...message,
                id: 3,
                seq: 3,
                type: "system_event",
                eventCode: "session_cancelled",
                body: null,
              },
              {
                ...message,
                id: 4,
                seq: 4,
                mine: true,
                senderId: 1,
                body: "Nos vemos en la próxima clase",
              },
            ],
        hasMore: false,
      };
    else if (p === "/conversations/1/read") data = { lastReadSeq: 4 };
    await route.fulfill({ status: 200, json: data });
  });
});

async function snapshot(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  name: string,
) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
  await expect(page.locator("body")).not.toContainText(/\[visual\./);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow, "no debe haber scroll horizontal de página").toBe(false);
}

test("preferencias: selección por teclado, confirmación e idioma conservan la zona", async ({
  page,
}, info) => {
  await page.goto("/settings");
  await expect(page.locator("#time-zone")).toBeVisible();
  await snapshot(page, info, "preferencias");
  const input = page.locator("#time-zone");
  await input.fill("Córdoba");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toContainText("Cordoba");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue(/Cordoba/);
  const before = await input.inputValue();
  await page.locator("#settings-language").selectOption("en");
  await expect(input).toHaveValue(before);
  await expect(
    page.getByRole("button", { name: /Save time zone/ }),
  ).toBeDisabled();
  await page.locator("#confirm-time-zone").check();
  const request = page.waitForRequest(
    (req) => req.method() === "PATCH" && req.postDataJSON()?.confirmTimeZone,
  );
  await page.getByRole("button", { name: /Save time zone/ }).click();
  expect((await request).postDataJSON()).toMatchObject({
    timeZone: expect.stringContaining("Cordoba"),
    confirmTimeZone: true,
  });
});

test("usuarios: directorio compacto, panel con foco y actualización de rol", async ({
  page,
}, info) => {
  await page.goto("/admin/users");
  await expect(page.locator(".user-table tbody tr")).toHaveCount(3);
  await snapshot(page, info, "usuarios");
  await page.getByRole("button", { name: "Ana Ejemplo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await snapshot(page, info, "usuario-panel");
  await page.locator("#role-2").selectOption("teacher");
  await expect(page.locator("#role-2")).toHaveValue("teacher");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Ana Ejemplo", exact: true }),
  ).toBeFocused();
});

test("agenda: selector y fechas UTC con límites explícitos", async ({
  page,
}, info) => {
  await page.goto("/schedule");
  await expect(page.locator("#scheduleZone")).toBeVisible();
  await snapshot(page, info, "agenda");
  await page.locator("#dateFrom").fill("2026-10-01");
  await page.locator("#dateTo").fill("2026-11-01");
  const request = page.waitForRequest((req) =>
    req.url().includes("/class-sessions?"),
  );
  await page.getByRole("button", { name: "Aplicar fechas" }).click();
  const url = new URL((await request).url());
  expect(url.searchParams.get("from")).toBe("2026-10-01T00:00:00Z");
  expect(url.searchParams.get("to")).toBe("2026-11-01T00:00:00Z");
});

test("clases, ventas, cupones y afiliados: acciones y barras proporcionadas", async ({
  page,
}, info) => {
  for (const [url, name, ready] of [
    ["/live", "clases", ".live-card"],
    ["/teacher/sales", "ventas", ".chart__bar"],
    ["/teacher/coupons", "cupones", ".actions"],
    ["/teacher/affiliates", "afiliados", ".actions"],
  ]) {
    await page.goto(url);
    await expect(page.locator(ready).first()).toBeVisible();
    await snapshot(page, info, name);
    if (name === "clases") {
      await expect(page.locator(".google-panel")).not.toContainText(
        "La conexión estará disponible",
      );
      await page.getByRole("button", { name: "En vivo", exact: true }).click();
      await expect(page.locator(".live-card")).toHaveCount(1);
    }
    if (name === "ventas") {
      expect(
        Number(await page.locator(".chart__bar").getAttribute("width")),
      ).toBeLessThanOrEqual(48);
    }
    if (name === "cupones" || name === "afiliados") {
      const buttons = await page
        .locator(".actions")
        .first()
        .locator("button.action-icon")
        .evaluateAll((els) =>
          els.map((e) => ({
            top: e.getBoundingClientRect().top,
            label: e.getAttribute("aria-label"),
          })),
        );
      expect(new Set(buttons.map((b) => Math.round(b.top))).size).toBe(1);
      expect(buttons.every((b) => b.label)).toBe(true);
    }
  }
});

test("mensajes: cancelación legible, cabecera y compositor visibles", async ({
  page,
}, info) => {
  await page.goto("/messages");
  await expect(page.locator(".inbox")).toBeVisible();
  await snapshot(page, info, "mensajes");
  await page.goto("/messages/1");
  await expect(page.locator(".event--warning")).toBeVisible();
  await snapshot(page, info, "conversacion");
  await expect(page.locator(".composer")).toBeInViewport();
  await expect(page.locator(".chat__head")).toBeInViewport();
  await page.locator('[data-status="cancelled"]').scrollIntoViewIfNeeded();
  const style = await page
    .locator('[data-status="cancelled"] h2')
    .evaluate((el) => ({
      color: getComputedStyle(el).color,
      opacity: getComputedStyle(el).opacity,
    }));
  expect(style.color).toBe("rgb(43, 43, 43)");
  expect(style.opacity).toBe("1");
  await page.locator("#chatDraft").fill("Borrador sin enviar");
  await page
    .getByRole("combobox", { name: "Idioma", exact: true })
    .selectOption("en");
  await expect(page.locator("#chatDraft")).toHaveValue("Borrador sin enviar");
});

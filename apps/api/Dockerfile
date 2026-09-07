# بناء صورة الـ API (NestJS + Prisma) لبيئة Docker في المعمل
FROM node:22.12-alpine AS build
WORKDIR /repo
# نحتاج كل الـ monorepo لأن @newport/domain حزمة داخلية
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
RUN npm ci
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src
# build → prune → generate: نبقي node_modules صغيرًا مع الحفاظ على عميل Prisma المولَّد
RUN npm run build -w @newport/domain && npm run build -w @newport/api && npm prune --omit=dev && npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:22.12-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache curl openssl postgresql16-client && addgroup -S newport && adduser -S newport -G newport
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./package.json
RUN chown -R newport:newport /app
USER newport
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 CMD curl -fsS http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["node", "dist/main.js"]

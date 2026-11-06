# Quy trình Git / Release

- `dev` là nhánh phát triển: mọi thay đổi code và tests được commit tại đây. Push vào `dev` chạy kiểm thử CI, **không tạo Release**.
- `main` chỉ nhận thay đổi khi chủ repository quyết định chốt. Nên bật branch protection/ruleset: yêu cầu PR, yêu cầu CI pass, chặn push trực tiếp lên `main`, tắt auto-merge. Đặt mặc định branch `dev` sau khi khởi tạo nếu thích.
- Khi PR từ `dev` được merge vào `main`, GitHub Actions `ci-release.yml` type-check, test, build plugin ZIP, tạo GitHub Release và tag `vX.Y.Z` từ `package.json`.
- Version phải tăng trước lần merge mới. Nếu tag hoặc release cùng phiên bản tồn tại, workflow **báo lỗi và không ghi đè**.
- Workflow yêu cầu Repository Settings → Actions → General → Workflow permissions cho phép **Read and write permissions**, hoặc chính sách cho phép `contents: write` ở job release.
- Chỉ merge khi bạn chốt. **Không** có auto-merge từ `dev`.

## Bootstrap repository trống

Nếu repo trên GitHub hoàn toàn chưa có commit/branch:

```bash
# Trong thư mục TẠM trống, KHÔNG phải thư mục source plugin
mkdir cocos-splines-bootstrap && cd cocos-splines-bootstrap
git init -b main
printf '# Cocos Splines\n\nSource code on branch dev. Production releases only after merge to main.\n' > README.md
git add README.md
git commit -m 'chore: bootstrap main (no plugin published)'
git remote add origin https://github.com/PhuNope/Cocos-Splines.git
git push -u origin main

git switch -c dev
# Copy full plugin source into this directory, giữ .github/workflows, .meta và docs
git add -A
git commit -m 'feat: Cocos Splines v0.8.1 with runtime events and CI release'
git push -u origin dev
```

**Chú ý:** nếu bạn đang ở trong source đã giải nén, đừng chạy `printf > README.md` vì sẽ thay README hiện có. Dùng một thư mục tạm riêng để bootstrap `main`, rồi clone repo và copy source vào `dev`.

## CI requirements

GitHub-hosted Ubuntu có `zip`, `unzip` và Node. Build không cần Cocos Creator; typecheck dùng bộ type mocks, vẫn cần smoke test thực tế trên Cocos 3.8.8 trước khi merge.

# Platform Optimization Engine (Epic 7.6)

Platform profilleri versioned ve configurable rehberlerdir; platformların değişmez gerçeği veya viral başarı garantisi değildir. Engine tek bir RenderManifest'ten platform-izole variant snapshot'ları üretir. Kaynak manifest hiçbir zaman overwrite edilmez.

Registry; aspect/resolution, normalized safe-area, subtitle, audio, visual ve export guidance alanlarını aynı kaynaktan sağlar. Preview, mevcut fingerprint ve profile version bağını doğrular. Manual approval gerektiren ve renderer/export orchestration tarafından desteklenmeyen işlemler `planned-only` kalır; applied listesine veya sahte readiness artışına girmez.

Resolution ve aspect-ratio tek geometry transaction olarak değerlendirilir. Kaynak oran hedef oranla eşleşmiyorsa gerçek crop/pad/reframe capability olmadan iki işlem de planned-only kalır; böylece width, height ve `render.aspectRatio` çelişkili bir variant üretmez. UI kaynakları gerçek UTF-8'tir; mojibake production metinlerinde kabul edilmez.

Preview; plan kimliği, plan fingerprint'i, platform/profile version ve canonical approval/effective-operation signature ile bind edilir. Bu bağlardan biri değişirse apply reddedilir. Manifest semantiği değiştiğinde source validation variant'a taşınmaz; variant yeniden doğrulanana kadar validation geçersizdir.

Studio, project + source fingerprint + platform + profile binding'ini merkezi hook ile izler. Binding değiştiğinde yalnız aktif plan/preview/approval state'i temizlenir; diğer platformların variant ve revision history kayıtları korunur. Kullanıcı yeniden analiz yapmadan apply düğmesi aktifleşmez.

Preview başarılı apply sonrasında tüketilir ve ikinci kez kullanılamaz. Aynı revision fingerprint'i veya no-op/planned-only sonucu history'ye eklenmez; platform başına geçmiş 12 kayıtla sınırlandırılır.

Epic 7.6 upload/publishing içermez. Export compatibility yalnızca plan ve capability uyarısı üretir; tam export orchestration Epic 7.7 kapsamındadır. Her platform variant'ı kendi kimliği ve revision zinciriyle izole edilir.
